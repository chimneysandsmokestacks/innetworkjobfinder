chrome.runtime.onInstalled.addListener(() => {
    console.log("LinkedIn Extension Installed.");
    // Initialize or reset the current index at extension install/reload
    chrome.storage.local.set({ currentIndex: 0 }, () => {
        // Retrieve and log the currentIndex after setting it
        chrome.storage.local.get('currentIndex', function(result) {
            console.log(`Initialized currentIndex to`, result.currentIndex);
        });
    });
});

// Constants for timing and state management
const STABILIZATION_DELAY = 3000;
let jobDetails = [];
let monitoredTabs = {};
let stabilizationTimeouts = {};

// Helper function to inject content scripts
function injectScript(tabId) {
    chrome.scripting.executeScript({
        target: {tabId: tabId},
        files: ['content.js']
    }, () => {
        if (chrome.runtime.lastError) {
            console.error("Error injecting content script:", chrome.runtime.lastError.message);
        } else {
            console.log(`Content script injected into Tab ID: ${tabId}`);
            monitoredTabs[tabId].injected = true;  // Prevents re-injection
        }
    });
}

// Listener for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case "openNewTab":
            if (message.url) {
                chrome.tabs.create({ url: message.url }, (newTab) => {
                    monitoredTabs[newTab.id] = { injected: false };
                    setTimeout(() => {
                        injectScript(newTab.id);
                    }, 1000);
                    console.log(`New tab opened with ID: ${newTab.id}, URL: ${message.url} and ready for script injection.`);
                    sendResponse({ status: "Tab opened and content script scheduled for injection", tabId: newTab.id });
                });
            } else {
                console.error("No URL provided for opening new tab.");
                sendResponse({ status: "Tab open failed", error: "No URL provided." });
            }
            return true;  // Indicates that this listener expects to send an asynchronous response
        case "closeCurrentTab":
            chrome.tabs.remove(sender.tab.id, () => {
                console.log(`Closed Tab ID: ${sender.tab.id}`);
                sendResponse({status: "Tab closed"});
            });
            break;
        case "foundPMJob":
            jobDetails.push(message);
            console.log("Stored job details:", jobDetails);
            sendResponse({status: "Job details stored"});
            break;
        case "requestJobDetails":
            sendResponse(jobDetails);
            break;
        case "clearJobDetails":
            jobDetails = [];
            console.log("Cleared all job details.");
            sendResponse({status: "Job details cleared"});
            break;
        case "loadContentScript":
            if (message.tabId) {
                monitoredTabs[message.tabId] = {injected: false, navigatedByExtension: true};
                injectScript(message.tabId);
                sendResponse({status: "Script injected, tab marked as legitimate"});
            }
            break;
    }
    return true; // Supports asynchronous response
});

// Tab update listener for managing page reloads and injections
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url.includes('/jobs')) {
        clearTimeout(stabilizationTimeouts[tabId]);
        stabilizationTimeouts[tabId] = setTimeout(() => {
            if (!monitoredTabs[tabId]?.injected) {
                injectScript(tabId);
            }
        }, STABILIZATION_DELAY);
    } else if (changeInfo.status === 'complete' && tab.url.includes('/search/results/')) {
        clearTimeout(stabilizationTimeouts[tabId]);
        stabilizationTimeouts[tabId] = setTimeout(() => {
            if (monitoredTabs[tabId]?.navigatedByExtension) {
                console.log(`Navigated to an invalid search results page in Tab ${tabId}, closing...`);
                chrome.tabs.remove(tabId);
                monitoredTabs[tabId].navigatedByExtension = false; // Reset flag after action
            }
        }, STABILIZATION_DELAY);
    }
});

// Clean up on tab close to remove any stale data
chrome.tabs.onRemoved.addListener(tabId => {
    if (monitoredTabs[tabId]) {
        delete monitoredTabs[tabId];
        clearTimeout(stabilizationTimeouts[tabId]);  // Clear timeouts on tab close
    }
});
