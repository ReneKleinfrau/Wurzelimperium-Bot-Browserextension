const sleep = ms => new Promise(res => setTimeout(res, ms));


let PLANT_INFO = {
    "Salat": 5, "Karotte": 15, "Gurke": 20, "Radieschen": 30, "Erdbeere": 40, "Tomate": 60, "Zwiebel": 80,
    "Spinat": 100, "Ringelblume": 120, "Knoblauch": 140, "Paprika": 160, "Zucchini": 200, "Kürbis": 240,
    "Spargel": 280, "Lavendel": 320, "Himbeere": 360, "Brombeere": 400, "Johannisbeere": 440,
    "Mirabelle": 480, "Apfel": 540, "Walnuss": 600, "Pflaume": 660, "Birne": 720, "Kirsche": 780, "Sonnenblume": 1440,
    "Kornblume": 50, "Klatschmohn": 60, "Gänseblümchen": 70, "Rose": 100, "Tulpe": 110,
    "Gerbera": 120, "Nelke": 140, "Orchidee": 240, "Lilie": 300,
    "Basilikum": 40, "Schnittlauch": 50, "Petersilie": 60, "Minze": 80, "Rosmarin": 100,
    "Thymian": 120, "Zitrone": 300, "Pilz": 480
};


function updateData() {
    const pkt = document.getElementById('pkt');
    const lvl = document.getElementById('levelnr');
    const bar = document.getElementById('bar');
    let stats = null;
    if (pkt && lvl && bar) {
        stats = { pkt: pkt.innerText, lvl: lvl.innerText, bar: bar.innerText };
    }

    let slots = [];
    for (let i = 1; i <= 100; i++) {
        const elem = document.getElementById('regal_' + i);
        if (elem && elem.style.display !== "none" && elem.innerHTML.includes('img')) {
            slots.push(i);
        }
    }

    let dataToSave = {};
    if (stats) dataToSave.stats = stats;
    if (slots.length > 0) dataToSave.regalSlots = slots;
    if (Object.keys(dataToSave).length > 0) chrome.storage.local.set(dataToSave);
}
setInterval(updateData, 1000);
updateData();


chrome.storage.local.get(['learnedTimes'], (res) => {
    if(res.learnedTimes) {
     
        PLANT_INFO = { ...PLANT_INFO, ...res.learnedTimes };
    }
});


function isTileValid(tile) {
    if (!tile) return false;
    if (tile.style.display === 'none' || tile.style.visibility === 'hidden') return false;
    if (tile.offsetWidth <= 0 || tile.offsetHeight <= 0) return false;
    return true;
}

// --- VISUALS: NEON HIGHLIGHT ---
function highlightSlot(slotId) {
    for (let i = 1; i <= 100; i++) {
        const old = document.getElementById('regal_' + i);
        if (old) {
            old.style.outline = "none";
            old.style.boxShadow = "none";
            old.style.zIndex = ""; 
            old.style.position = ""; 
        }
    }

    const item = document.getElementById(slotId);
    if (item) {
        item.style.outline = "3px solid #39ff14"; 
        item.style.boxShadow = "0 0 15px #39ff14, inset 0 0 5px #39ff14"; 
        item.style.borderRadius = "4px";
        item.style.position = "relative"; 
        item.style.zIndex = "999999"; 
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// --- FEATURES ---

// 1. REGAL ZEITEN
async function scanRegalTimes() {
    const storage = await chrome.storage.local.get(['regalSlots']);
    const knownSlots = storage.regalSlots || [];
    
    if (knownSlots.length === 0) {
        chrome.runtime.sendMessage({ action: "regalScanStatus", text: "Fehler: Keine Slots gefunden." });
        return;
    }

    let learnedTimes = {};
    let foundCount = 0;

    for (let i of knownSlots) {
        const slot = document.getElementById('regal_' + i);
        if (slot) {
            slot.click();
            await sleep(200);
            
            const nameEl = document.getElementById('lager_name');
            const timeEl = document.getElementById('lager_zeit');
            
            if (nameEl && timeEl) {
                const name = nameEl.innerText.trim();
                const timeStr = timeEl.innerText.trim(); 
                const cleanTime = timeStr.replace(' h', '').trim();
                const parts = cleanTime.split(':');
                
                if (parts.length === 3) {
                    const totalMinutes = (parseInt(parts[0]) * 60) + parseInt(parts[1]) + (parseInt(parts[2]) / 60);
                    if (name && totalMinutes > 0) {
                        learnedTimes[name] = totalMinutes;
                        foundCount++;
                        chrome.runtime.sendMessage({ action: "regalScanStatus", text: `Lese: ${name}` });
                    }
                }
            }
        }
    }

    if (foundCount > 0) {
        chrome.storage.local.set({ learnedTimes: learnedTimes });
        PLANT_INFO = { ...PLANT_INFO, ...learnedTimes };
        chrome.runtime.sendMessage({ action: "regalScanStatus", text: `Fertig! ${foundCount} Zeiten.` });
    } else {
        chrome.runtime.sendMessage({ action: "regalScanStatus", text: `Keine Zeiten lesbar.` });
    }
}


async function calcBanker() {

    const data = await chrome.storage.local.get(['marketPrices', 'learnedTimes']);
    const prices = data.marketPrices || {};
    const ownedItems = data.learnedTimes || {}; 

    let results = [];
    

    let itemsToCalculate = [];
    
    if (Object.keys(ownedItems).length > 0) {
        itemsToCalculate = Object.keys(ownedItems); // NUR Eigentum
    } else {
        itemsToCalculate = Object.keys(PLANT_INFO); // Alles (Fallback)
    }

    itemsToCalculate.forEach(name => {

        const duration = ownedItems[name] || PLANT_INFO[name];
        const price = prices[name];

        if (duration && price > 0) {
            const perHour = price * (60 / duration);
            let durText = Math.round(duration) + " Min";
            if (duration >= 60) durText = (duration/60).toFixed(1) + " Std";
            
            results.push({ 
                name: name, 
                durationText: durText, 
                price: price, 
                profitPerHour: perHour 
            });
        }
    });

    chrome.runtime.sendMessage({ action: "bankerResults", data: results });
}

// 3. MARKT
async function deepScanMarket() {
    let prices = {};
    const parser = new DOMParser();
    const MAX_ID = 120; 

    for (let id = 1; id <= MAX_ID; id++) {
        let percent = Math.round((id / MAX_ID) * 100);
        chrome.runtime.sendMessage({ action: "marketStatus", text: `Scanne ID ${id}...`, progress: percent });
        try {
            const response = await fetch(`stadt/markt.php?order=p&v=${id}&filter=1`);
            const text = await response.text();
            const doc = parser.parseFromString(text, "text/html");
            const nameLink = doc.querySelector('a[title^="Nur "]');
            let productName = nameLink ? nameLink.innerText.trim() : "";
            
            if (productName) {
                let foundPrice = 0;
                const rows = doc.querySelectorAll('tr');
                for (let r of rows) {
                    if (r.innerHTML.includes('<th') || r.innerText.includes('Klicke')) continue;
                    const cells = r.querySelectorAll('td');
                    if (cells.length >= 4) {
                        for (let cell of cells) {
                            let txt = cell.innerText.trim();
                            if (txt.includes('wT')) {
                                let match = txt.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
                                if (match) {
                                    let val = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                                    if (val > 0 && val < 40000) {
                                        if (foundPrice === 0 || val < foundPrice) foundPrice = val;
                                    }
                                }
                            }
                        }
                    }
                    if (foundPrice > 0) break; 
                }
                prices[productName] = foundPrice;
            }
        } catch (e) { }
        await sleep(200); 
    }
    chrome.storage.local.set({ marketPrices: prices });
    chrome.runtime.sendMessage({ action: "marketStatus", text: `Fertig!`, progress: 100 });
}

// 4. WIMP BOT
async function runWimpBot(sellMode = false) {
    const wimpContainer = document.getElementById('wimpareaWimps');
    if (!wimpContainer) return; 

    const data = await chrome.storage.local.get(['marketPrices']);
    const marketPrices = data.marketPrices || {};
    const wimps = wimpContainer.querySelectorAll('.wimp'); 
    
    if (wimps.length === 0) {
        chrome.runtime.sendMessage({ action: "wimpAnalysisDone", results: [] });
        return;
    }

    let analysisResults = [];
    for (let i = 0; i < wimps.length; i++) {
        const wimp = document.getElementById('i' + i);
        if (!wimp || wimp.style.display === 'none') continue;
        wimp.click();
        await sleep(600);
        const productsDiv = document.getElementById('wimpVerkaufProducts');
        const priceDiv = document.getElementById('wimpVerkaufSumAmount');
        const btnYes = document.getElementById('wimpVerkaufYes');
        const btnLater = document.getElementById('wimpVerkaufLater');

        if (productsDiv && priceDiv) {
            let text = productsDiv.innerText.trim();
            let match = text.match(/(\d+)\s*x?\s*(.+)/);
            if (match) {
                let amount = parseInt(match[1]);
                let name = match[2].trim();
                let priceRaw = priceDiv.innerText.replace(' wT', '').replace(/\./g, '').replace(',', '.');
                let wimpTotal = parseFloat(priceRaw);
                let wimpUnit = wimpTotal / amount;
                let marketUnit = marketPrices[name] || 0;
                let percent = 0;
                let isGoodDeal = false;

                if (marketUnit > 0) {
                    percent = (wimpUnit / marketUnit) * 100;
                    if (percent >= 75) isGoodDeal = true;
                }
                analysisResults.push({ name: name, amount: amount, percent: percent, isGood: isGoodDeal, marketPrice: marketUnit });

                const color = isGoodDeal ? '#2e7d32' : (marketUnit === 0 ? '#ef6c00' : '#d32f2f');
                let infoText = marketUnit === 0 ? "Markt unbekannt" : `Markt: ${marketUnit.toFixed(2)} | ${percent.toFixed(0)}%`;
                let oldInfo = productsDiv.querySelector('.tgs-info');
                if(oldInfo) oldInfo.remove();
                productsDiv.innerHTML += `<br><span class="tgs-info" style="font-weight:bold; font-size:10px; color:${color}">${infoText}</span>`;

                if (sellMode && isGoodDeal && btnYes) {
                    btnYes.click(); await sleep(800);
                    const confirm = document.getElementById('baseDialogButton2'); if(confirm) confirm.click();
                } else { if (btnLater) btnLater.click(); }
            } else { if (btnLater) btnLater.click(); }
        }
        await sleep(400);
    }
    chrome.runtime.sendMessage({ action: "wimpAnalysisDone", results: analysisResults });
}

// 5. GARTEN
async function runAction(type, slotId = null) {
    if (slotId) {
        const item = document.getElementById(slotId);
        if (item) {
            highlightSlot(slotId); 
            item.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
            item.click();
            item.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
            await sleep(500); 
        } else { return; }
    } else {
        const btn = document.getElementById(type);
        if (btn) btn.click();
        await sleep(300);
    }

    for (let i = 1; i <= 204; i++) {
        const tile = document.getElementById('gardenTile' + i);
        
        if (!isTileValid(tile)) continue; 

        if (slotId && (tile.innerHTML.indexOf('vrow') !== -1 || tile.querySelector('.vrow'))) continue;
        
        tile.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
        tile.click();
        tile.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
        
        setTimeout(() => {
            const dialog = document.getElementById('baseDialogButton2');
            if (dialog && dialog.offsetParent !== null) dialog.click();
        }, 10);
    }
    await sleep(500);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ernten") runAction('ernten');
    if (request.action === "giessen") runAction('giessen');
    if (request.action === "saen") runAction(null, request.slot);
    if (request.action === "highlight") highlightSlot(request.slot);
    if (request.action === "deepScanMarket") deepScanMarket();
    if (request.action === "calcBanker") calcBanker();
    if (request.action === "checkWimps") runWimpBot(false);
    if (request.action === "sellWimps") runWimpBot(true);
    if (request.action === "scanRegalTimes") scanRegalTimes();
});