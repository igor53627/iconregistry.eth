const https = require('https');

// Fusaka activation slot
const FUSAKA_SLOT = 13164544;
const FUSAKA_ETA = new Date('2025-12-03T21:49:11Z');

// Beaconcha.in API
const BEACONCHA_API = 'https://beaconcha.in/api/v1';

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'iconregistry-monitor/1.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse: ${data.slice(0, 100)}`));
                }
            });
        }).on('error', reject);
    });
}

async function getCurrentSlot() {
    try {
        const data = await httpsGet(`${BEACONCHA_API}/slot/latest`);
        if (data.status === 'OK' && data.data) {
            return data.data.slot;
        }
        throw new Error('Invalid response');
    } catch (err) {
        // Fallback: calculate from genesis
        const GENESIS_TIME = 1606824023; // Dec 1, 2020 12:00:23 UTC
        const SLOT_DURATION = 12; // seconds
        const now = Math.floor(Date.now() / 1000);
        return Math.floor((now - GENESIS_TIME) / SLOT_DURATION);
    }
}

async function getSlotInfo(slot) {
    try {
        const data = await httpsGet(`${BEACONCHA_API}/slot/${slot}`);
        return data.data || null;
    } catch {
        return null;
    }
}

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

function estimateSlotTime(currentSlot, targetSlot) {
    const slotsRemaining = targetSlot - currentSlot;
    const msRemaining = slotsRemaining * 12 * 1000;
    return new Date(Date.now() + msRemaining);
}

async function monitor() {
    console.log('=== Fusaka Upgrade Monitor ===\n');
    console.log(`Target slot: ${FUSAKA_SLOT.toLocaleString()}`);
    console.log(`Expected ETA: ${FUSAKA_ETA.toISOString()}`);
    console.log(`Gas limit after Fusaka: 60,000,000\n`);
    console.log('Monitoring...\n');
    
    let lastSlot = 0;
    let activated = false;
    
    while (!activated) {
        try {
            const currentSlot = await getCurrentSlot();
            
            if (currentSlot !== lastSlot) {
                lastSlot = currentSlot;
                const slotsRemaining = FUSAKA_SLOT - currentSlot;
                const estimatedTime = estimateSlotTime(currentSlot, FUSAKA_SLOT);
                
                if (slotsRemaining <= 0) {
                    console.log('\n*** FUSAKA ACTIVATED ***\n');
                    console.log(`Current slot: ${currentSlot.toLocaleString()}`);
                    console.log(`Fusaka slot: ${FUSAKA_SLOT.toLocaleString()}`);
                    console.log('\nYou can now run the icon upload script!');
                    console.log('Command: MAX_GAS_PRICE_GWEI=0.05 node scripts/upload-icons-mainnet.js\n');
                    activated = true;
                } else {
                    const timeRemaining = formatTime(slotsRemaining * 12 * 1000);
                    const progress = ((currentSlot / FUSAKA_SLOT) * 100).toFixed(4);
                    
                    console.log([
                        `Slot: ${currentSlot.toLocaleString()}`,
                        `Remaining: ${slotsRemaining.toLocaleString()} slots`,
                        `ETA: ${estimatedTime.toLocaleString()}`,
                        `(${timeRemaining})`,
                        `[${progress}%]`
                    ].join(' | '));
                    
                    // Alert when close
                    if (slotsRemaining <= 100) {
                        console.log('\n*** LESS THAN 100 SLOTS REMAINING - GET READY! ***\n');
                    } else if (slotsRemaining <= 500) {
                        console.log('  ^ Less than 10 minutes!');
                    }
                }
            }
        } catch (err) {
            console.error('Error:', err.message);
        }
        
        // Poll every 6 seconds (half a slot)
        await new Promise(r => setTimeout(r, 6000));
    }
    
    return true;
}

// Also export for use in other scripts
module.exports = { getCurrentSlot, FUSAKA_SLOT, monitor };

// Run if called directly
if (require.main === module) {
    monitor().catch(console.error);
}
