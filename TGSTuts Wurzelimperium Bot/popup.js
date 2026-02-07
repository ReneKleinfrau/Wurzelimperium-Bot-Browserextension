document.addEventListener('DOMContentLoaded', () => {
    

    const sendAction = (action, data = {}) => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, {action: action, ...data});
        });
    };


    const refreshUI = () => {
        chrome.storage.local.get(['stats', 'regalSlots', 'marketPrices'], (res) => {
            // Stats
            if (res.stats) {
                document.getElementById('pkt').innerText = res.stats.pkt;
                document.getElementById('lvl').innerText = res.stats.lvl;
                document.getElementById('bar').innerText = res.stats.bar;
            }

            // Regal Dropdown
            const select = document.getElementById('selSlot');
            if (res.regalSlots && res.regalSlots.length > 0) {
 
                if (select.options.length <= 1) {
                    select.innerHTML = "";
                    res.regalSlots.forEach(id => {
                        let opt = document.createElement('option');
                        opt.value = "regal_" + id;
                        opt.innerHTML = "Slot " + id;
                        select.appendChild(opt);
                    });


                    if (select.options.length > 0) {
                        select.selectedIndex = 0;
                        sendAction("highlight", {slot: select.value});
                    }
                }
            }

            // Tabs Sperren/Entsperren
            const hasMarketData = res.marketPrices && Object.keys(res.marketPrices).length > 0;
            document.querySelectorAll('.needs-scan').forEach(tab => {
                const overlay = tab.querySelector('.scan-overlay');
                const content = tab.querySelector('.scan-content');
                if (hasMarketData) {
                    overlay.style.display = 'none';
                    content.classList.remove('disabled-area');
                } else {
                    overlay.style.display = 'block';
                    content.classList.add('disabled-area');
                }
            });

            // Markt Liste
            if (document.getElementById('tab-markt').classList.contains('active') && hasMarketData) {
                const list = document.getElementById('marketList');
                if(list.children.length <= 1) {
                    list.innerHTML = "";
                    Object.keys(res.marketPrices).sort().forEach(name => {
                        const price = res.marketPrices[name];
                        const row = document.createElement('div');
                        row.className = "list-item";
                        let priceHtml = price <= 0 ? `<span class="tag tag-warn">Keine Angebote</span>` : `<span>${price.toFixed(2)} wT</span>`;
                        row.innerHTML = `<span>${name}</span> ${priceHtml}`;
                        list.appendChild(row);
                    });
                }
            }
        });
    };

    setInterval(refreshUI, 1000);
    refreshUI();

    // --- TABS & EVENTS ---
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).classList.add('active');
            if(tab.dataset.target === 'tab-markt') document.getElementById('marketList').innerHTML = ""; 
            refreshUI();
        });
    });

    document.getElementById('btnErnten').addEventListener('click', () => sendAction("ernten"));
    document.getElementById('btnGiessen').addEventListener('click', () => sendAction("giessen"));
    document.getElementById('btnSaen').addEventListener('click', () => {
        const slot = document.getElementById('selSlot').value;
        if(slot && slot.startsWith('regal')) sendAction("saen", {slot: slot});
    });
    

    document.getElementById('selSlot').addEventListener('change', (e) => sendAction("highlight", {slot: e.target.value}));

    document.getElementById('btnDeepScan').addEventListener('click', () => {
        document.getElementById('marketStatus').innerText = "Starte Komplett-Scan...";
        document.getElementById('scanProgress').style.width = "0%";
        sendAction("deepScanMarket");
    });

    document.getElementById('btnScanRegalTimes').addEventListener('click', () => {
        document.getElementById('regalStatus').innerText = "Lese Zeiten aus...";
        sendAction("scanRegalTimes");
    });
    
    document.getElementById('btnCalcBanker').addEventListener('click', () => sendAction("calcBanker"));

    document.getElementById('btnWimpCheck').addEventListener('click', () => {
        const list = document.getElementById('wimpResults');
        list.style.display = "block";
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#2e7d32;"><b>⏳ Analysiere Wimps...</b><br><span style="font-size:10px">Warten...</span></div>';
        sendAction("checkWimps");
    });
    
    document.getElementById('btnWimpSell').addEventListener('click', () => {
        if(confirm("Nur profitable (grüne) Angebote verkaufen?")) sendAction("sellWimps");
    });

    // Messages
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "marketStatus") {
            document.getElementById('marketStatus').innerText = msg.text;
            if (msg.progress) document.getElementById('scanProgress').style.width = msg.progress + "%";
        }
        if (msg.action === "regalScanStatus") document.getElementById('regalStatus').innerText = msg.text;
        
        if (msg.action === "bankerResults") {
            const list = document.getElementById('bankerList');
            list.innerHTML = "";
            if(!msg.data || msg.data.length === 0) {
                list.innerHTML = '<div style="padding:10px; text-align:center;">Keine Daten. Zeiten eingelesen?</div>'; return;
            }
            msg.data.sort((a, b) => b.profitPerHour - a.profitPerHour);
            msg.data.forEach(item => {
                const row = document.createElement('div');
                row.className = "list-item";
                row.innerHTML = `<div style="display:flex; flex-direction:column;"><span style="font-weight:bold;">${item.name}</span><span style="font-size:9px; color:#888;">Dauer: ${item.durationText}</span></div><div style="text-align:right;"><span class="tag tag-good">${item.profitPerHour.toFixed(2)} wT/h</span><br><span style="font-size:9px;">Preis: ${item.price.toFixed(2)}</span></div>`;
                list.appendChild(row);
            });
        }

        if (msg.action === "wimpAnalysisDone") {
            const list = document.getElementById('wimpResults');
            list.innerHTML = "";
            if (!msg.results || msg.results.length === 0) { 
                list.innerHTML = '<div style="padding:10px; text-align:center;">Keine Wimps am Zaun.</div>'; return; 
            }
            msg.results.forEach(w => {
                const row = document.createElement('div'); row.className = "list-item";
                let tagClass = "tag-bad"; let tagText = w.percent.toFixed(0) + "%";
                if (w.marketPrice === 0) { tagClass = "tag-warn"; tagText = "Leer"; } 
                else if (w.percent >= 75) { tagClass = "tag-good"; }
                row.innerHTML = `<div><b>${w.name}</b> <span style="font-size:9px">(${w.amount})</span></div><div class="tag ${tagClass}">${tagText}</div>`;
                list.appendChild(row);
            });
        }
    });
});