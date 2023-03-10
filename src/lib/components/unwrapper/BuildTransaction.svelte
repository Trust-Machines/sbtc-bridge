<script lang="ts">
import { onMount } from 'svelte';
import { sbtcConfig } from '$stores/stores'
import type { SbtcConfig } from '$types/sbtc_config';
import Principal from "../common/Principal.svelte";
import PegOutAmount from "./PegOutAmount.svelte";
import UTXOSelection from "$lib/components/common/UTXOSelection.svelte";
import { createEventDispatcher } from "svelte";
import PegOutTransaction from '$lib/domain/PegOutTransaction';
import type { PegOutTransactionI } from '$lib/domain/PegOutTransaction';
import { base } from '$app/paths'
import { explorerAddressUrl } from "$lib/utils";
import { requestSignMessage } from '$lib/stacks'
import { getAccount } from '@micro-stacks/svelte';

export let poTx:PegOutTransactionI;
  
const account = getAccount();
if (!poTx.pegInData.stacksAddress) poTx.pegInData.stacksAddress = $account.stxAddress
$: principalData = {
  label: 'Stacks Contract or Account Address',
  info: 'sBTC will be burned from this account',
  currentAddress: poTx.pegInData.stacksAddress,
}
$: amtData = {
  pegIn: false,
  label: 'Amount (SBTC)',
  info: 'The amount to unwrap cannot exceed your sBTC balance',
  pegAmount: (poTx.pegInData.amount > 0) ? poTx.pegInData.amount : $sbtcConfig.balance.balance,
  maxCommit: poTx.maxCommit(),
  change: poTx.getChange(),
  fee: poTx.fee,
  fees: poTx.fees,
  dust: poTx.dust
}
const network = import.meta.env.VITE_NETWORK;
$: utxoData = {
  label: 'Bitcoin Address',
  info: 'Your sBTC will be burned and the equivalent bitcoin then sent to this address',
  maxCommit: (poTx.ready) ? poTx.maxCommit() : 0,
  fromBtcAddress: (poTx.ready) ? poTx.fromBtcAddress : undefined,
  numbInputs: (poTx.ready) ? poTx.addressInfo.utxos.length : 0,
  network
}
  
console.log('poTx:', poTx);
const dispatch = createEventDispatcher();
let ready = true;

let errorReason:string|undefined;
let stxAddressOk = true;
let amountOk = true;

const updateConfig = () => {
  const conf:SbtcConfig = $sbtcConfig;
  conf.pegOutTransaction = poTx;
  sbtcConfig.update(() => conf);
  amountOk = poTx.pegInData.amount > 0;
}

const requestSignature = async () => {
  const script = poTx.getOutput2ScriptPubKey();
  const msg = { script: script.toString('hex') }
  const sigData:any = await requestSignMessage(msg);
  if (sigData.error) {
    return;
  }
  const conf:SbtcConfig = $sbtcConfig;
  conf.sigData = sigData;
  sbtcConfig.update(() => conf);
  console.log(sigData);
  dispatch('request_signature');
}

const amountUpdated = (event:any) => {
  amountOk = !event.detail.error;
  if (amountOk) {
    poTx.setFeeRate(event.detail.newFeeRate)
    poTx.setAmount(event.detail.newAmount)
    updateConfig();
  } else {
    errorReason = event.detail.reason;
  }
}

const principalUpdated = (event:any) => {
  stxAddressOk = !event.detail.error;
  if (stxAddressOk) {
    poTx.setStacksAddress(event.detail.currentAddress)
    updateConfig();
  }
}

const utxoUpdated = async (event:any) => {
  errorReason = undefined;
  const data:any = event.detail;
  if (data.opCode === 'address-change') {
    try {
      poTx = await PegOutTransaction.create(network, data.bitcoinAddress, $sbtcConfig.sbtcContractData.sbtcWalletAddress);
      poTx.calculateFees();
      updateConfig();
    } catch (err:any) {
      errorReason = err.message;
    }
  }
}

$: showStxAddress = poTx.ready && !errorReason;
$: showAmount = poTx.ready && stxAddressOk && !errorReason;
$: showButton = poTx.ready && amountOk && !errorReason;

onMount(async () => {
  if (!poTx.pegInData.stacksAddress) stxAddressOk = false;
  if (poTx.pegInData.amount! > 0) amountOk = true;
  if (poTx.ready) poTx.calculateFees();
  updateConfig();
})


</script>  

{#if ready}
  <div class="mb-4"><UTXOSelection {utxoData} on:utxo_updated={utxoUpdated} /></div>
  {#if $sbtcConfig.balance.balance <= 0}
  <div class="text-center text-warning my-5">
    <p class="mb-4">No SBTC to unwrap for account: <a href={explorerAddressUrl($sbtcConfig.balance.address)}>{$sbtcConfig.balance.address}</a></p>
    <p><a href="{base}/wrap">Get sBTC here!</a></p>
  </div>
  {:else}
  {#if showStxAddress}
  <div class="mb-4"><Principal {principalData} on:principal_updated={principalUpdated} /></div>
  {/if}
  {#if showAmount}
  <div class="mb-4"><PegOutAmount {amtData} on:amount_updated={amountUpdated} /></div>
  {/if}
  {#if showButton}
  <div class="row">
    <div class="col">
      <button class="btn btn-outline-info w-100" type="button" on:click={() => requestSignature()}>CONTINUE</button>
    </div>
  </div>
  {/if}
  {/if}
  {#if errorReason}<div class="text-danger">{errorReason}</div>{/if}
{:else}
<div class="lobby bg-dark">
  <p class="text-white">Problem Connecting to APIs</p>
  <p><span class="nav-item">Status: Bridge API currently experiencing connectivity problems.
    We are already working on this.
  <span class="mt-5 text-warning">Please report this to the core engineering team!</span></p>
</div>
{/if}


<style>
.row {
  margin-top: 20px;
  margin-bottom: 40px;
}
</style>