var DEBUG = false;
chrome.runtime.onInstalled.addListener(() => {
    if (DEBUG) {
        console.log("Extension Installed.");
    }

    chrome.storage.local.get('jobTitleSetByUser', (data) => {
        if (data.jobTitleSetByUser) {
            if (DEBUG) {
                console.log(`Job title set to: ${data.jobTitleSetByUser}`);
            }
        } else {
            if (DEBUG) {
                console.log('No job title has been set yet.');
            }
        }
    });

    chrome.storage.local.set({
        currentIndex: 0
    }, () => {

        chrome.storage.local.get('currentIndex', function(result) {
            if (DEBUG) {
                console.log(`Initialized currentIndex to`, result.currentIndex);
            }
        });
    });
});

const stabilizationTimeouts = {};
const STABILIZATION_DELAY = 3000; 
let jobDetails = []; 
let monitoredTabs = {}; 
var tabProfileLinks = {};

function injectScript(tabId) {
    if (DEBUG) {
        console.log("Attempting to inject script into tab ID:", tabId);
    }

    if (monitoredTabs[tabId] && monitoredTabs[tabId].stopInjection) {
        if (DEBUG) {
            console.log("Injection stopped by user request for tab ID:", tabId);
        }
        chrome.runtime.sendMessage({
            action: "operationHalted",
            tabId: tabId
        });

        monitoredTabs[tabId].stopInjection = false;
        return;
    }

    chrome.scripting.executeScript({
        target: {
            tabId: tabId
        },
        files: ['content.js']
    }, () => {
        if (chrome.runtime.lastError) {
            if (DEBUG) {
                console.error("Error injecting content script into tab:", chrome.runtime.lastError.message);
            }
        } else {
            if (DEBUG) {
                console.log("content.js successfully injected into tab ID:", tabId);
            }
            if (!monitoredTabs[tabId]) {
                if (DEBUG) {
                    console.log("No monitored entry found for tabId, initializing...");
                }
                monitoredTabs[tabId] = {
                    injected: true
                };
            }
            monitoredTabs[tabId].injected = true;
            if (DEBUG) {
                console.log("Updated state of monitoredTabs after injection:", monitoredTabs);
            }
        }
    });
}

let isUpdatingJobDetails = false;

function updateJobDetails(message, sendResponse) {
    if (isUpdatingJobDetails) {
        setTimeout(() => updateJobDetails(message, sendResponse), 100); 
        return;
    }
    isUpdatingJobDetails = true;
    chrome.storage.local.get({
        jobDetails: []
    }, (data) => {
        let updatedJobDetails = data.jobDetails || [];
        updatedJobDetails.push({
            profileUrl: message.profileUrl,
            personName: message.personName,
            personjobTitle: message.personjobTitle,
            companyName: message.companyName,
            jobUrl: message.jobUrl,
            jobTitleText: message.jobTitleText,
            jobLocation: message.jobLocation,
            companyLink: message.companyLink
        });
        chrome.storage.local.set({
            jobDetails: updatedJobDetails
        }, () => {
            if (DEBUG) {
                console.log("Job details updated and stored:", updatedJobDetails);
            }
            sendResponse({
                status: "Job details stored"
            });
            isUpdatingJobDetails = false;
        });
    });
}

let frame = 0;
const frameRate = 50; 
const frames = [
    '/images/logo1.png', '/images/logo2.png', '/images/logo3.png',
    '/images/logo4.png', '/images/logo5.png', '/images/logo6.png',
    '/images/logo7.png', '/images/logo8.png', '/images/logo9.png',
    '/images/logo10.png', '/images/logo11.png'
]
let animationInterval = null; 

function animateIcon() {
    if (frames.length > 0) {
        frame = (frame + 1) % frames.length; 
        chrome.action.setIcon({
            path: frames[frame]
        }); 
        animationInterval = setTimeout(animateIcon, frameRate); 
    }
}

function startAnimation() {
    if (!animationInterval) {
        animateIcon(); 
    }
}

function stopAnimation() {
    if (animationInterval) {
        clearTimeout(animationInterval); 
        animationInterval = null; 

        const nextImageIndex = (frame + 1) % frames.length;
        chrome.action.setIcon({
            path: frames[nextImageIndex]
        });
    }
}

function closeTabAndAdvanceIndex(tabId) {
    if (DEBUG) {
        console.log(`Request received to close tab ID: ${tabId}`);
    }
    chrome.tabs.get(tabId, function(closingTab) {
        if (chrome.runtime.lastError) {
            if (DEBUG) {
                console.log("Error retrieving tab:", chrome.runtime.lastError.message);
            }
            return;
        }

        chrome.tabs.remove(tabId, () => {
            if (DEBUG) {
                console.log("Current tab closed.");
            }
            const openedFromCurrentSearchTabId = monitoredTabs[tabId]?.openedFromCurrentSearchTabId;
            const currentSearchIndex = monitoredTabs[openedFromCurrentSearchTabId]?.currentIndex || 0;

            if (openedFromCurrentSearchTabId) {

                const nextIndex = currentSearchIndex + 1;
                monitoredTabs[openedFromCurrentSearchTabId].currentIndex = nextIndex;

                chrome.tabs.get(openedFromCurrentSearchTabId, (searchTab) => {
                    if (chrome.runtime.lastError) {
                        if (DEBUG) {
                            console.log("Search tab no longer exists:", chrome.runtime.lastError.message);
                        }
                        return;
                    }

                    if (closingTab.active) {
                        chrome.tabs.update(openedFromCurrentSearchTabId, {
                            active: true
                        });
                        if (DEBUG) {
                            console.log(`Switched to search results tab: ${openedFromCurrentSearchTabId}`);
                        }
                    }

                    injectScript(openedFromCurrentSearchTabId);
                    if (DEBUG) {
                        console.log(`Sending message to open next profile on tab: ${openedFromCurrentSearchTabId}`);
                    }

                });
            } else {
                if (DEBUG) {
                    console.log("No stored search tab ID found.");
                }
            }
        });
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (DEBUG) {
        console.log("Background script received a message from:", sender, message);
    }
    switch (message.action) {

        case "openNewTab":
            if (message.url) {

                if (DEBUG) {
                    console.log("Opening new tab from sender tab ID:", sender.tab.id);
                }
                let senderTabId = sender.tab.id;

                if (monitoredTabs[senderTabId]?.stopInjection) {
                    if (DEBUG) {
                        console.log("Stop flag is set for this tab. Halting operations.");
                    }
                    sendResponse({
                        status: "Tab open halted",
                        error: "Operation stopped by user."
                    });

                    chrome.runtime.sendMessage({
                        action: "operationHalted",
                        message: "Operation halted due to stop flag."
                    });

                    return true; 
                }

                let windowId = monitoredTabs[senderTabId]?.searchWindowId || chrome.windows.WINDOW_ID_CURRENT;
                if (DEBUG) {
                    console.log("Using window ID:", windowId);
                }

                chrome.storage.local.get(['tabOpeningRecords', 'maxNumberOfTabs'], (data) => {
                    let tabOpeningRecords = data.tabOpeningRecords || [];
                    let maxNumberOfTabs = data.maxNumberOfTabs || 1000; 

                    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                    tabOpeningRecords = tabOpeningRecords.filter(record => record.time > oneDayAgo);

                    if (tabOpeningRecords.length < maxNumberOfTabs) {

                        chrome.tabs.create({
                            windowId: windowId,
                            url: message.url,
                            active: true 
                        }, (newTab) => {
                            if (chrome.runtime.lastError) {
                                if (DEBUG) {
                                    console.error("Error creating new tab:", chrome.runtime.lastError.message);
                                }
                                sendResponse({
                                    status: "Tab open failed",
                                    error: chrome.runtime.lastError.message
                                });
                                return;
                            }

                            if (DEBUG) {
                                console.log("New tab created with ID:", newTab.id);
                            }

                            tabOpeningRecords.push({
                                tabId: newTab.id,
                                time: Date.now()
                            });
                            chrome.storage.local.set({
                                tabOpeningRecords
                            }, () => {
                                if (DEBUG) {
                                    console.log("Tab opening records updated.");
                                }
                            });
                            monitoredTabs[newTab.id] = {
                                injected: false,
                                openedFromCurrentSearchTabId: senderTabId,
                                pageNavigatedByExtension: false,
                                navigatedByExtension: true,
                            };
                            if (DEBUG) {
                                console.log(`Monitored tab ${newTab.id} updated with new tab data:`, monitoredTabs[newTab.id]);
                            }
                            injectScript(newTab.id);
                            sendResponse({
                                status: "Tab opened",
                                tabId: newTab.id
                            });
                        });
                        return true;
                    } else {
                        if (DEBUG) {
                            console.log("Reached maximum tab limit within the last 24 hours. Not opening more tabs.");
                        }
                        sendResponse({
                            status: "Tab open failed",
                            error: "Reached maximum tab limit."
                        });
                    }
                });
            } else {
                if (DEBUG) {
                    console.error("No URL provided for opening new tab.");
                }
                sendResponse({
                    status: "Tab open failed",
                    error: "No URL provided."
                });
            }
            return true;

        case "closeCurrentTab":

            closeTabAndAdvanceIndex(sender.tab.id);
            break;

        case "logSearchJobTitle":
            if (DEBUG) {
                console.log(`Job title being searched: ${message.jobTitle}`);
            }
            sendResponse({
                status: "Job Title Logged",
                jobTitle: message.jobTitle
            });
            break;

        case "foundJob":
            updateJobDetails(message, sendResponse);
            return true;

        case "logPause":
            if (DEBUG) {
                console.log(`Pausing for ${message.duration} seconds...`);
            }
            startAnimation(); 
            setTimeout(() => {
                stopAnimation(); 
            }, message.duration * 1000); 
            break;

        case "logInfo":
            if (DEBUG) {
                console.log(message.info);
            } 
            sendResponse({
                status: "Information logged successfully"
            })
            return true;
            break;

        case "requestJobDetails":

            chrome.storage.local.get('jobDetails', (data) => {
                if (data.jobDetails) {

                    sendResponse({
                        status: "Job details sent",
                        jobDetails: data.jobDetails
                    });
                } else {
                    if (DEBUG) {
                        console.log("No job details found in storage.");
                    }
                    sendResponse({
                        status: "No job details found",
                        jobDetails: []
                    });
                }
            });
            return true;

        case "clearJobDetails":

            chrome.storage.local.set({
                jobDetails: []
            }, () => {
                if (DEBUG) {
                    console.log("Cleared job details in storage.");
                }
            });

            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                if (tabs.length > 0 && tabs[0].id) {
                    let currentTabId = tabs[0].id;

                    sendMessageToBackground({
                        action: "updateIndex",
                        tabId: currentTabId,
                        newIndex: 0
                    });
                    if (DEBUG) {
                        console.log(`Request sent to update index to 0 for tab ID: ${currentTabId}.`);
                    }
                } else {
                    if (DEBUG) {
                        console.error("No active tab found, unable to reset index.");
                    }
                }
            });
            sendResponse({
                status: "Job details cleared and index request sent"
            });
            return true;

        case "loadContentScript":
            if (message.tabId && message.windowId) {

                monitoredTabs[message.tabId] = {
                    injected: false,
                    navigatedByExtension: false,
                    currentIndex: 0, 
                    currentSearchTabId: message.tabId,
                    searchWindowId: message.windowId
                };
                tabProfileLinks[message.tabId] = []; 
                if (DEBUG) {
                    console.log(`Preparing to inject content script into tab: ${message.tabId}`);
                }

                injectScript(message.tabId, () => {

                    if (chrome.runtime.lastError) {
                        if (DEBUG) {
                            console.error("Error injecting content script:", chrome.runtime.lastError.message);
                        }
                        sendResponse({
                            status: "injectionFailed",
                            error: chrome.runtime.lastError.message
                        });
                    } else {
                        if (DEBUG) {
                            console.log("Content script injected successfully into tab: " + message.tabId);
                        }

                        monitoredTabs[message.tabId].injected = true;
                        monitoredTabs[message.tabId].navigatedByExtension = false;

                        if (DEBUG) {
                            console.log(`Script injected and flags set for tab: ${message.tabId} in window: ${message.windowId}`);
                        }
                        sendResponse({
                            status: "Script injected and tab marked as the right search page"
                        });
                    }
                });
            } else {
                if (DEBUG) {
                    console.error("Required information (tab ID or window ID) not provided for content script injection.");
                }
                sendResponse({
                    status: "injectionFailed",
                    error: "Required information missing."
                });
            }
            return true;

        case "stopScript":
            const tabId = message.tabId; 
            if (tabId) {
                if (DEBUG) {
                    console.log("Setting stop flag for tab ID:", tabId);
                }
                if (!monitoredTabs[tabId]) {
                    monitoredTabs[tabId] = {
                        injected: false,
                        stopInjection: false
                    };
                }
                monitoredTabs[tabId].stopInjection = true; 
                sendResponse({
                    status: "Stop flag set for tab ID: " + tabId
                });
            } else {
                if (DEBUG) {
                    console.error("No tab ID provided in the message.");
                }
                sendResponse({
                    status: "No tab ID found in message."
                });
            }
            break;
        default:
            if (DEBUG) {
                console.log("Unhandled action:", message.action);
            }
            sendResponse({
                status: "Action not handled"
            });

            return true;

        case "storeProfileLinks":
            if (sender.tab.id) {
                tabProfileLinks[sender.tab.id] = message.profileLinks;
                sendResponse({
                    status: "Profile links stored successfully"
                });
            }
            return true;

        case "clearProfileLinks":
            if (sender.tab.id && tabProfileLinks[sender.tab.id]) {
                tabProfileLinks[sender.tab.id] = []; 
                sendResponse({
                    status: "Profile links cleared successfully"
                });
            }
            break;

        case "getStoredProfileLinks":

            if (sender.tab && sender.tab.id) {
                const tabId = sender.tab.id;
                if (DEBUG) {
                    console.log(`Received request for stored profile links for tab ID: ${tabId}`);
                }

                if (DEBUG) {
                    console.log(`Looking up profile links for tab ID: ${tabId}`);
                }
                if (tabProfileLinks[tabId]) {
                    if (DEBUG) {
                        console.log(`Profile links found for tab ID ${tabId}:`, tabProfileLinks[tabId]);
                    }
                    sendResponse({
                        profileLinks: tabProfileLinks[tabId]
                    });
                } else {
                    if (DEBUG) {
                        console.log(`No profile links found for tab ID ${tabId}.`);
                    }
                    sendResponse({
                        error: "No profile links available for this tab."
                    });
                }
            } else {
                if (DEBUG) {
                    console.log("Error: Message sender does not have a valid tab context.");
                }
                sendResponse({
                    error: "Message not sent from a valid tab."
                });
            }
            return true;

        case "getCurrentIndex":
            if (sender.tab && sender.tab.id && monitoredTabs[sender.tab.id]) {

                const currentIndex = monitoredTabs[sender.tab.id].currentIndex;
                sendResponse({
                    currentIndex: currentIndex
                });
                if (DEBUG) {
                    console.log(`Sent current index ${currentIndex} for tab ID: ${sender.tab.id}`);
                }
            } else {
                sendResponse({
                    error: "Tab ID is undefined or index not found"
                });
                if (DEBUG) {
                    console.error("Failed to retrieve current index for sender tab.");
                }
            }
            break;

        case "updateIndex": {
            const tabId = sender.tab.id; 
            const windowId = sender.tab.windowId; 

            if (!monitoredTabs[tabId]) {
                monitoredTabs[tabId] = {
                    injected: false, 
                    navigatedByExtension: true, 
                    currentIndex: message.newIndex, 
                    windowId: windowId 
                };
            } else {

                monitoredTabs[tabId].currentIndex = message.newIndex;
            }

            if (DEBUG) {
                console.log(`Index updated to ${message.newIndex} for tab ${tabId} in window ${windowId}.`);
            }
            const updatedIndex = monitoredTabs[tabId].currentIndex

            sendResponse({
                status: "Index updated",
                newIndex: updatedIndex
            });
        }
        return true;

        case "setPageNavigatedByExtensionFlag":

            if (sender.tab && sender.tab.id) {
                let tabId = sender.tab.id; 

                if (!monitoredTabs[tabId]) {
                    monitoredTabs[tabId] = {}; 
                }

                monitoredTabs[tabId].pageNavigatedByExtension = message.flag;
                if (DEBUG) {
                    console.log(`Flag pageNavigatedByExtension set to ${message.flag} for tab: ${tabId}`);
                }

                sendResponse({
                    status: 'Flag set for PageNavigatedByExtension',
                    tabId: tabId
                });
            } else {

            }
            return true; 

        case "setNavigatedByExtensionFlag":

            if (sender.tab && sender.tab.id) {
                let tabId = sender.tab.id; 

                if (!monitoredTabs[tabId]) {
                    monitoredTabs[tabId] = {}; 
                }

                monitoredTabs[tabId].navigatedByExtension = message.flag;
                if (DEBUG) {
                    console.log(`Flag navigatedByExtension set to ${message.flag} for tab: ${tabId}`);
                }

                sendResponse({
                    status: 'navigatedByExtension flag set',
                    tabId: tabId
                });

                if (DEBUG) {
                    console.log(`Current state of monitoredTabs for tabId ${tabId}:`, monitoredTabs[tabId]);
                }
            } else {
                if (DEBUG) {
                    console.error('No tab ID found in the sender information');
                }
            }
            return true; 

        case "setInjectedFlag":

            if (sender.tab && sender.tab.id) {
                let tabId = sender.tab.id; 

                if (!monitoredTabs[tabId]) {
                    monitoredTabs[tabId] = {}; 
                }

                monitoredTabs[tabId].injected = message.flag;
                if (DEBUG) {
                    console.log(`Flag injected set to ${message.flag} for tab: ${tabId}`);
                }

                sendResponse({
                    status: 'injected Flag set',
                    tabId: tabId
                });
            } else {
                if (DEBUG) {
                    console.error('No tab ID found in the sender information');
                }
            }
            return true; 

    }
    return true; 

});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (monitoredTabs[tabId]) {
        delete monitoredTabs[tabId];
        if (DEBUG) {
            console.log(`Monitoring stopped and data cleared for Tab ID: ${tabId}`);
        }
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {

        if (stabilizationTimeouts[tabId]) {
            clearTimeout(stabilizationTimeouts[tabId]);
        }

        stabilizationTimeouts[tabId] = setTimeout(() => {

            if (monitoredTabs[tabId]) {
                const navigatedByExtension = monitoredTabs[tabId]?.navigatedByExtension;
                const pageNavigatedByExtension = monitoredTabs[tabId]?.pageNavigatedByExtension;
                if (DEBUG) {
                    console.log(`Current state for Tab ${tabId}:`, monitoredTabs[tabId]);
                }
                if (tab.url.includes('/search/results/') || tab.url.includes('/company/unavailable/')) {
                    if (DEBUG) {
                        console.log(`Received pageNavigatedByExtension flag for ${tabId}: ${pageNavigatedByExtension}`);
                    }
                    if (pageNavigatedByExtension) {

                        if (DEBUG) {
                            console.log(`Page navigation recognized as legitimate in Tab ${tabId}. Injecting content script.`);
                        }
                        injectScript(tabId);
                        monitoredTabs[tabId].pageNavigatedByExtension = false; 
                    } else if (navigatedByExtension) {

                        if (DEBUG) {
                            console.log(`Navigation recognized as extension-triggered in Tab ${tabId}. Closing tab and advancing index.`);
                        }
                        closeTabAndAdvanceIndex(tabId);
                    } else {

                        if (DEBUG) {
                            console.log(`Navigation to a search page detected without flags in Tab ${tabId}.`);
                        }

                    }
                }

                if (tab.url.includes('/jobs') && !monitoredTabs[tabId].injected) {

                    if (DEBUG) {
                        console.log(`Stabilized URL '${tab.url}' for Tab ${tabId}. Injecting content script.`);
                    }
                    injectScript(tabId);
                    monitoredTabs[tabId].injected = true; 
                }
            }
        }, STABILIZATION_DELAY)
    }
});

function logKnownEmployees() {
    chrome.storage.local.get('knownEmployees', (data) => {
        if (data.knownEmployees) {
            if (DEBUG) {
                console.log("Current knownEmployees:", JSON.stringify(data.knownEmployees, null, 2));
            }
        } else {
            if (DEBUG) {
                console.log("No known Employees found in storage.");
            }
        }
    });
}
