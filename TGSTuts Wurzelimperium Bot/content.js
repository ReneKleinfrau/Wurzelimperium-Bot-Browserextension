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
    if (stats) chrome.storage.local.set({ stats: stats });
}
setInterval(updateData, 1000);
updateData();

chrome.storage.local.get(['learnedTimes'], (res) => {
    if(res.learnedTimes) PLANT_INFO = { ...PLANT_INFO, ...res.learnedTimes };
});


function isTileValid(tile) {
    if (!tile) return false;
    if (tile.style.display === 'none' || tile.style.visibility === 'hidden') return false;
    if (tile.offsetWidth <= 0 || tile.offsetHeight <= 0) return false;
    return true;
}

function highlightSlot(slotId) {
    const allItems = document.querySelectorAll('.regalItem');
    allItems.forEach(el => {
        el.style.outline = "none";
        el.style.boxShadow = "none";
        el.style.zIndex = ""; 
        el.style.position = ""; 
    });

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




async function scanShelf() {
    const slots = document.querySelectorAll('#regal .regalItem');
    if (slots.length === 0) {
        chrome.runtime.sendMessage({ action: "shelfScanStatus", text: "Fehler: Regal nicht gefunden." });
        return;
    }

    let shelfData = []; 
    let foundCount = 0;

    for (let slot of slots) {
        const slotIdFull = slot.id;
        const slotIdNum = slotIdFull.replace('regal_', '');
        
        highlightSlot(slotIdFull);

        slot.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
        slot.click();
        slot.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
        
        await sleep(300); 
        
        const nameEl = document.getElementById('lager_name');
        const timeEl = document.getElementById('lager_zeit');
        
        if (nameEl && timeEl) {
            const name = nameEl.innerText.trim();
            const timeStr = timeEl.innerText.trim(); 
            const cleanTime = timeStr.replace(' h', '').replace(/\./g, '').trim();
            const parts = cleanTime.split(':');
            
            if (parts.length === 3) {
                const totalMinutes = (parseInt(parts[0]) * 60) + parseInt(parts[1]) + (parseInt(parts[2]) / 60);
                if (name) {
                    shelfData.push({ id: slotIdNum, name: name, time: totalMinutes });
                    foundCount++;
                    chrome.runtime.sendMessage({ action: "shelfScanStatus", text: `Gelernt: ${name}` });
                }
            }
        }
    }

    const allItems = document.querySelectorAll('.regalItem');
    allItems.forEach(el => { el.style.outline = "none"; el.style.boxShadow = "none"; });

    if (foundCount > 0) {
        chrome.storage.local.set({ shelfData: shelfData });
        let newTimes = {};
        shelfData.forEach(item => newTimes[item.name] = item.time);
        chrome.storage.local.set({ learnedTimes: newTimes });
        PLANT_INFO = { ...PLANT_INFO, ...newTimes };
        chrome.runtime.sendMessage({ action: "shelfScanStatus", text: `Fertig! ${foundCount} Pflanzen gespeichert.` });
    } else {
        chrome.runtime.sendMessage({ action: "shelfScanStatus", text: `Fehler: Konnte nichts lesen.` });
    }
}


async function calcBanker() {
    const data = await chrome.storage.local.get(['marketPrices', 'shelfData']);
    const prices = data.marketPrices || {};
    const shelfItems = data.shelfData || []; 

    let results = [];
    if (shelfItems.length > 0) {
        shelfItems.forEach(item => {
            const price = prices[item.name];
            if (item.time > 0 && price > 0) {
                const perHour = price * (60 / item.time);
                let durText = Math.round(item.time) + " Min";
                if (item.time >= 60) durText = (item.time/60).toFixed(1) + " Std";
                if (!results.some(r => r.name === item.name)) {
                    results.push({ name: item.name, durationText: durText, price: price, profitPerHour: perHour });
                }
            }
        });
    } else {
        Object.keys(PLANT_INFO).forEach(name => {
             const price = prices[name];
             const duration = PLANT_INFO[name];
             if(price && duration) {
                 const perHour = price * (60 / duration);
                 results.push({ name: name, durationText: Math.round(duration)+" Min", price: price, profitPerHour: perHour });
             }
        });
    }
    chrome.runtime.sendMessage({ action: "bankerResults", data: results });
}


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


function injectBranding() {
    
    if (!document.getElementById('tgs-style')) {
        const style = document.createElement('style');
        style.id = 'tgs-style';
        style.innerHTML = `
            @keyframes tgs-rainbow {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }
            .tgs-brand {
                font-family: 'Verdana', sans-serif;
                font-size: 10px;
                font-weight: bold;
                text-align: center;
                margin-top: 5px;
                padding: 4px;
                border-radius: 4px;
                color: #fff;
                /* Regenbogen Hintergrund */
                background: linear-gradient(270deg, #ff0000, #eeff00, #00ff00, #006eff, #ff00de, #ff0000);
                background-size: 400% 400%;
                animation: tgs-rainbow 8s ease infinite;
                
                text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
                box-shadow: 0 0 10px rgba(255,255,255,0.4);
                cursor: default;
                pointer-events: none; /* Klickt durch */
                border: 1px solid rgba(255,255,255,0.5);
            }
            .tgs-brand-bar {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 12px;
                padding: 2px 10px;
            }
        `;
        document.head.appendChild(style);
    }

    
    const userMenu = document.getElementById('menuUserdata');
    if (userMenu && !document.getElementById('tgs-brand-top')) {
        const brand = document.createElement('div');
        brand.id = 'tgs-brand-top';
        brand.className = 'tgs-brand';
        brand.innerText = '✨ Bot by TGSTuts';
        userMenu.appendChild(brand);
        
        userMenu.style.height = "auto";
        userMenu.style.paddingBottom = "5px";
    }

    
    const bottomBar = document.getElementById('rahmen_quer');
    if (bottomBar && !document.getElementById('tgs-brand-bottom')) {
        const brand = document.createElement('div');
        brand.id = 'tgs-brand-bottom';
        brand.className = 'tgs-brand tgs-brand-bar';
        brand.innerText = '🚀 Besuche gerne meinen Youtube-Channel! 🚀';
        bottomBar.appendChild(brand);
        
        if(getComputedStyle(bottomBar).position === 'static') {
            bottomBar.style.position = 'relative';
        }
    }
}

setInterval(injectBranding, 2000);
injectBranding();



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ernten") runAction('ernten');
    if (request.action === "giessen") runAction('giessen');
    if (request.action === "saen") runAction(null, request.slot);
    if (request.action === "highlight") highlightSlot(request.slot);
    if (request.action === "deepScanMarket") deepScanMarket();
    if (request.action === "calcBanker") calcBanker();
    if (request.action === "checkWimps") runWimpBot(false);
    if (request.action === "sellWimps") runWimpBot(true);
    if (request.action === "scanShelf") scanShelf();
});