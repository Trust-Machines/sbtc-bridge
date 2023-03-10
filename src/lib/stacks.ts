
import { c32address, c32addressDecode } from 'c32check';
import { tupleCV, bufferCV, uintCV, stringAsciiCV } from "micro-stacks/clarity";
import { verifyStructuredDataSignature } from '$lib/structured-data';
import { hexToBytes } from "micro-stacks/common";
import type { Message } from '$types/message';
import type { SignatureData as MicroStacksSignatureData } from "micro-stacks/connect";
import { get_client } from "$stores/client";
import { mountClient, getMicroStacksClient } from "@micro-stacks/svelte";
import { client } from "$stores/client";
import { sbtcConfig } from '$stores/stores'
import { StacksMocknet, StacksTestnet, StacksMainnet } from "micro-stacks/network";
import { fetchUserSbtcBalance } from '$lib/bridge_api'
import type { SbtcConfig } from '$types/sbtc_config';

export let webWalletNeeded = false;

const enum ChainID {
    Testnet = 2147483648,
    Mainnet = 1
}

const allowed = [
	{ btc: '2N8fMsws2pTGfNzkFTLWdUYM5RTWEAphieb', stx: 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRCBGD7R'}, // devnet testing
	{ btc: '2N8fMsws2pTGfNzkFTLWdUYM5RTWEAphieb', stx: 'SP1R1061ZT6KPJXQ7PAXPFB6ZAZ6ZWW28GBQA1W0F'}, // mike 1
	{ btc: 'bc1qfdxax8gr9lufdf4j5wzkhelczr804n89ze2rfa', stx: 'SP3N4AJFZZYC4BK99H53XP8KDGXFGQ2PRSQP2HGT6'}, // mike 2
	{ btc: '1EJboSZVgPNrKCVmhmkV2rjLW4KN2Urti', stx: 'SP1ACWJC0TMD9F3Q3FJQFDWV9GSSTXN8RY31HR10B'}, // igor
	{ btc: '1FFaqXGJPNvU28QhsCz9gsRatc1C55V33e', stx: 'SP2E57N3DDG0CSF6XYWABZ1E7QBF8CTKJ4J1PHP0V'}, // jude
	{ btc: 'bc1q8j0gh8754jd9jerlxvpvxx4kc82e4u7f8ynnvp', stx: 'SP1R3S5RB1FSKCGQGW16ZHHPK6FAN57EAQ3RD7HP9'}, // marten
]
	
export function isAllowed(address:string) {
	return allowed.find((o) => o.stx === address);
}

export function setUpMicroStacks() {
	let origin = import.meta.env.VITE_ORIGIN;
	const network = import.meta.env.VITE_NETWORK;
	if (typeof window !== 'undefined') {
	origin = window.location.origin;
	}
	let stxNetwork:StacksMainnet|StacksMocknet|StacksTestnet;
	if (network === 'testnet') stxNetwork = new StacksTestnet();
	else if (network === 'mainnet') stxNetwork = new StacksMainnet();
	else stxNetwork = new StacksMocknet();
	const config = {
		appName: 'sBTC Client',
		appIconUrl: origin + '/img/logo.png',
		network: stxNetwork
	};
	//console.log('layout.svelte: ', config)
	mountClient(config);
	client.set(getMicroStacksClient());
}

export const domain = {
	name: import.meta.env.VITE_PUBLIC_APP_NAME,
	version: import.meta.env.VITE_PUBLIC_APP_VERSION,
	'chain-id': import.meta.env.VITE_NETWORK === "mainnet" ? ChainID.Mainnet : ChainID.Testnet,
};

export const domainCV = tupleCV({
	name: stringAsciiCV(import.meta.env.VITE_PUBLIC_APP_NAME),
	version: stringAsciiCV(import.meta.env.VITE_PUBLIC_APP_VERSION),
	'chain-id': uintCV(import.meta.env.VITE_NETWORK === "mainnet" ? ChainID.Mainnet : ChainID.Testnet),
})

export type SignatureData = {
	signature: string, //Uint8Array,
	public_key: string //Uint8Array,
};

export function verifySignedMessage(message:any, pubKey:string) {
	if (!message.signature)
		return false;
	const signature = typeof message.signature === "string" ? hexToBytes(message.signature): message.signature;
	return verifyStructuredDataSignature(domainCV, messageToTuple(message), hexToBytes(pubKey), signature);
}

function signatureDataBuffers(data: MicroStacksSignatureData) {
	return {
		signature: data.signature, //hexToBytes(data.signature),
		public_key: data.publicKey //hexToBytes(data.publicKey),
	};
}

export async function requestSignMessage(message: any): Promise<SignatureData | {error:boolean, reason:string}> {
	return new Promise(resolve =>
		get_client().signStructuredMessage({
			message: messageToTuple(message),
			domain: domain,
			onFinish: (result: MicroStacksSignatureData) => resolve(signatureDataBuffers(result)),
			onCancel: () => resolve(({error: true, reason:'user canceled sign operation'}))
		})
	);
}

function messageToTuple(message: Message) {
	return tupleCV({
		script: bufferCV(message.script)
	});
}

export function decodeStacksAddress(stxAddress:string) {
	if (!stxAddress) throw new Error('Needs a stacks address');
	const decoded = c32addressDecode(stxAddress)
	return decoded
}
  
export function encodeStacksAddress (network:string, b160Address:string) {
	let version = 26
	if (network === 'mainnet') version = 22
	const address = c32address(version, b160Address) // 22 for mainnet
	return address
}

export async function fetchSbtcBalance (addr:string) {
	const result = await fetchUserSbtcBalance(addr);
	sbtcConfig.update((conf:SbtcConfig) => { 
		conf.balance = result
		conf.balance.address = addr;
		return conf; 
	});
}

export async function login($auth: any) {
	try {
		$auth.openAuthRequest({
			onFinish: async (payload: any) => {
				console.log('payload:', payload);
				if (!isAllowed(payload.addresses.mainnet)) {
					$auth.signOut();
				} else {
					const network = import.meta.env.VITE_NETWORK;
					const addr = (network === 'testnet') ? payload.addresses.testnet : payload.addresses.mainnet;
					await fetchSbtcBalance(addr);
				}
			},
			onCancel: () => {
				console.log('canceled');
			}
  		}).catch((err:any) => {
          console.log(err);
          // https://www.hiro.so/wallet/install-web
          webWalletNeeded = false;
        });
	} catch (e) {
		if (window) window.location.href = "https://wallet.hiro.so/wallet/install-web";
	}
}