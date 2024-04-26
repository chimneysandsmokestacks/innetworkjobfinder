chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension Installed.");

    // Retrieve and log the job title set by the user
    chrome.storage.local.get('jobTitleSetByUser', (data) => {
        if (data.jobTitleSetByUser) {
            console.log(`Job title set to: ${data.jobTitleSetByUser}`);
        } else {
            console.log('No job title has been set yet.');
        }
    });

    chrome.storage.local.set({
        currentIndex: 0
    }, () => {
        // Retrieve and log the currentIndex after setting it
        chrome.storage.local.get('currentIndex', function(result) {
            console.log(`Initialized currentIndex to`, result.currentIndex);
        });
    });
});

const stabilizationTimeouts = {};
const STABILIZATION_DELAY = 3000; // Delay to stabilize website
let jobDetails = []; // Array to store the details of jobs found
let monitoredTabs = {}; // Store tabs that need to be monitored for navigation to "/jobs/"
var tabProfileLinks = {};

//new helper function with stop functionality
function injectScript(tabId) {
    console.log("Attempting to inject script into tab ID:", tabId);
    // Check if the stop flag is set for this tab
    if (monitoredTabs[tabId] && monitoredTabs[tabId].stopInjection) {
        console.log("Injection stopped by user request for tab ID:", tabId);
        chrome.runtime.sendMessage({
            action: "operationHalted",
            tabId: tabId
        });
        // Reset the flag after handling the stop request
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
            console.error("Error injecting content script into tab:", chrome.runtime.lastError.message);
        } else {
            console.log("content.js successfully injected into tab ID:", tabId);
            if (!monitoredTabs[tabId]) {
                console.log("No monitored entry found for tabId, initializing...");
                monitoredTabs[tabId] = {
                    injected: true
                };
            }
            monitoredTabs[tabId].injected = true;
            console.log("Updated state of monitoredTabs after injection:", monitoredTabs);
        }
    });
}


let isUpdatingJobDetails = false;
function updateJobDetails(message, sendResponse) {
    if (isUpdatingJobDetails) {
        setTimeout(() => updateJobDetails(message, sendResponse), 100); // Retry after a short delay
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
            console.log("Job details updated and stored:", updatedJobDetails);
            sendResponse({
                status: "Job details stored"
            });
            isUpdatingJobDetails = false;
        });
    });
}



        let frame = 0;
        const frameRate = 50; // Frame rate in milliseconds
        const frames = [
        '/images/logo1.png', '/images/logo2.png', '/images/logo3.png',
        '/images/logo4.png', '/images/logo5.png', '/images/logo6.png',
        '/images/logo7.png', '/images/logo8.png', '/images/logo9.png',
        '/images/logo10.png', '/images/logo11.png']
        let animationInterval = null;  // Initialize to null for clarity

        function animateIcon() {
        if (frames.length > 0) {
            frame = (frame + 1) % frames.length; // Cycle through frames
            chrome.action.setIcon({ path: frames[frame] }); // Update to use 'chrome.action' API
            animationInterval = setTimeout(animateIcon, frameRate); // Schedule the next frame update
        }
        }

        function startAnimation() {
        if (!animationInterval) {
            animateIcon(); // Start animation
        }
        }

        function stopAnimation() {
    if (animationInterval) {
        clearTimeout(animationInterval); // Stop the animation
        animationInterval = null; // Reset the interval ID
        // Set the icon to the next image in the sequence after the last one shown
        const nextImageIndex = (frame + 1) % frames.length;
        chrome.action.setIcon({ path: frames[nextImageIndex] });
    }
}



function closeTabAndAdvanceIndex(tabId) {
    console.log(`Request received to close tab ID: ${tabId}`);
    chrome.tabs.get(tabId, function(closingTab) {
        if (chrome.runtime.lastError) {
            console.log("Error retrieving tab:", chrome.runtime.lastError.message);
            return;
        }
        // Remove the tab
        chrome.tabs.remove(tabId, () => {
            console.log("Current tab closed.");
            const openedFromCurrentSearchTabId = monitoredTabs[tabId]?.openedFromCurrentSearchTabId;
            const currentSearchIndex = monitoredTabs[openedFromCurrentSearchTabId]?.currentIndex || 0;


            // Ensure that searchTabId is defined and then increment index for it
            if (openedFromCurrentSearchTabId) {
                // Increment the index in monitoredTabs object
                const nextIndex = currentSearchIndex + 1;
                monitoredTabs[openedFromCurrentSearchTabId].currentIndex = nextIndex;

                // Check the existence of search tab
                chrome.tabs.get(openedFromCurrentSearchTabId, (searchTab) => {
                    if (chrome.runtime.lastError) {
                        console.log("Search tab no longer exists:", chrome.runtime.lastError.message);
                        return;
                    }

                    // If the closed tab was active, switch to the stored search results tab
                    if (closingTab.active) {
                        chrome.tabs.update(openedFromCurrentSearchTabId, {
                            active: true
                        });
                        console.log(`Switched to search results tab: ${openedFromCurrentSearchTabId}`);
                    }

                    // Reinject content script and continue operation on the search tab
                    injectScript(openedFromCurrentSearchTabId);
                    console.log(`Sending message to open next profile on tab: ${openedFromCurrentSearchTabId}`);

                });
            } else {
                console.log("No stored search tab ID found.");
            }
        });
    });
}


//listener function for messages from content.js or popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background script received a message from:", sender, message);
    switch (message.action) {



        case "openNewTab":
            if (message.url) {
                // Log the tab ID of the sender if available
                console.log("Opening new tab from sender tab ID:", sender.tab.id);
                let senderTabId = sender.tab.id;

                // Check the stop flag before proceeding
                if (monitoredTabs[senderTabId]?.stopInjection) {
                    console.log("Stop flag is set for this tab. Halting operations.");
                    sendResponse({
                        status: "Tab open halted",
                        error: "Operation stopped by user."
                    });

                    // Send a message to popup.js that the operation was halted
                    chrome.runtime.sendMessage({
                        action: "operationHalted",
                        message: "Operation halted due to stop flag."
                    });

                    return true; // Ensure the messaging channel is closed properly
                }

                // Check if we have a stored window ID to open the new tab in
                let windowId = monitoredTabs[senderTabId]?.searchWindowId || chrome.windows.WINDOW_ID_CURRENT;
                console.log("Using window ID:", windowId);

                // Get the current records of tabs opened and the maximum allowed
                chrome.storage.local.get(['tabOpeningRecords', 'maxNumberOfTabs'], (data) => {
                    let tabOpeningRecords = data.tabOpeningRecords || [];
                    let maxNumberOfTabs = data.maxNumberOfTabs || 1000; // Use a sensible default if not set

                    // Filter records to keep only those within the last 24 hours
                    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
                    tabOpeningRecords = tabOpeningRecords.filter(record => record.time > oneDayAgo);

                    if (tabOpeningRecords.length < maxNumberOfTabs) {
                        // Still under the limit, open the new tab
                        chrome.tabs.create({
                            windowId: windowId,
                            url: message.url,
                            active: true // Open in background
                        }, (newTab) => {
                            if (chrome.runtime.lastError) {
                                console.error("Error creating new tab:", chrome.runtime.lastError.message);
                                sendResponse({
                                    status: "Tab open failed",
                                    error: chrome.runtime.lastError.message
                                });
                                return;
                            }
                            // Log the new tab ID
                            console.log("New tab created with ID:", newTab.id);
                            // Add the new tab's opening record and update the records
                            tabOpeningRecords.push({
                                tabId: newTab.id,
                                time: Date.now()
                            });
                            chrome.storage.local.set({
                                tabOpeningRecords
                            }, () => {
                                console.log("Tab opening records updated.");
                            });
                            monitoredTabs[newTab.id] = {
                                injected: false,
                                openedFromCurrentSearchTabId: senderTabId,
                                pageNavigatedByExtension: false,
                                navigatedByExtension: true,
                            };
                            console.log(`Monitored tab ${newTab.id} updated with new tab data:`, monitoredTabs[newTab.id]);
                            injectScript(newTab.id);
                            sendResponse({
                                status: "Tab opened",
                                tabId: newTab.id
                            });
                        });
                        return true;
                    } else {
                        console.log("Reached maximum tab limit within the last 24 hours. Not opening more tabs.");
                        sendResponse({
                            status: "Tab open failed",
                            error: "Reached maximum tab limit."
                        });
                    }
                });
            } else {
                console.error("No URL provided for opening new tab.");
                sendResponse({
                    status: "Tab open failed",
                    error: "No URL provided."
                });
            }
            return true;


        case "closeCurrentTab":
            // Use the helper function to close the tab and handle the index incrementation
            closeTabAndAdvanceIndex(sender.tab.id);
            break;

        case "logSearchJobTitle":
            console.log(`Job title being searched: ${message.jobTitle}`);
            sendResponse({
                status: "Job Title Logged",
                jobTitle: message.jobTitle
            });
            break;


        case "foundJob":
            updateJobDetails(message, sendResponse);
            return true;

       case "logPause":
            console.log(`Pausing for ${message.duration} seconds...`);
            startAnimation(); // Start the animation when pause starts
            setTimeout(() => {
                stopAnimation(); // Stop the animation after the pause duration
            }, message.duration * 1000); // Convert seconds to milliseconds
            break;



         


        case "logInfo":
            console.log(message.info); // Log the information received from content.js
            sendResponse({
                status: "Information logged successfully"
            })
            return true;
            break;


        case "requestJobDetails":
            // Retrieve job details from local storage and send them to the requester
            chrome.storage.local.get('jobDetails', (data) => {
                if (data.jobDetails) {
                    //  console.log("Sending job details to requester:", JSON.stringify(data.jobDetails, null, 2));
                    sendResponse({
                        status: "Job details sent",
                        jobDetails: data.jobDetails
                    });
                } else {
                    console.log("No job details found in storage.");
                    sendResponse({
                        status: "No job details found",
                        jobDetails: []
                    });
                }
            });
            return true;


        case "clearJobDetails":
            // Clear the jobDetails in chrome.storage.local
            chrome.storage.local.set({
                jobDetails: []
            }, () => {
                console.log("Cleared job details in storage.");
            });
            // Retrieve the active tab in the current window to send the index reset message
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                if (tabs.length > 0 && tabs[0].id) {
                    let currentTabId = tabs[0].id;
                    // Send message to update the index for the current tab to 0
                    sendMessageToBackground({
                        action: "updateIndex",
                        tabId: currentTabId,
                        newIndex: 0
                    });
                    console.log(`Request sent to update index to 0 for tab ID: ${currentTabId}.`);
                } else {
                    console.error("No active tab found, unable to reset index.");
                }
            });
            sendResponse({
                status: "Job details cleared and index request sent"
            });
            return true;




        case "loadContentScript":
            if (message.tabId && message.windowId) {
                // Initialize or reset the monitoredTabs and tabProfileLinks entries for this tab
                monitoredTabs[message.tabId] = {
                    injected: false,
                    navigatedByExtension: false,
                    currentIndex: 0, // Initialize the index to 0
                    currentSearchTabId: message.tabId,
                    searchWindowId: message.windowId
                };
                tabProfileLinks[message.tabId] = []; // Reset the tabProfileLinks array for this tab
                console.log(`Preparing to inject content script into tab: ${message.tabId}`);
                // Inject the content script into the  tab
                injectScript(message.tabId, () => {
                    // Check for injection errors
                    if (chrome.runtime.lastError) {
                        console.error("Error injecting content script:", chrome.runtime.lastError.message);
                        sendResponse({
                            status: "injectionFailed",
                            error: chrome.runtime.lastError.message
                        });
                    } else {
                        console.log("Content script injected successfully into tab: " + message.tabId);

                        // Update the monitoredTabs object for the current tab after successful injection
                        monitoredTabs[message.tabId].injected = true;
                        monitoredTabs[message.tabId].navigatedByExtension = false;

                        console.log(`Script injected and flags set for tab: ${message.tabId} in window: ${message.windowId}`);
                        sendResponse({
                            status: "Script injected and tab marked as the right search page"
                        });
                    }
                });
            } else {
                console.error("Required information (tab ID or window ID) not provided for content script injection.");
                sendResponse({
                    status: "injectionFailed",
                    error: "Required information missing."
                });
            }
            return true;

        case "stopScript":
            const tabId = message.tabId; // Get tabId directly from the message
            if (tabId) {
                console.log("Setting stop flag for tab ID:", tabId);
                if (!monitoredTabs[tabId]) {
                    monitoredTabs[tabId] = {
                        injected: false,
                        stopInjection: false
                    };
                }
                monitoredTabs[tabId].stopInjection = true; // Set the stop flag
                sendResponse({
                    status: "Stop flag set for tab ID: " + tabId
                });
            } else {
                console.error("No tab ID provided in the message.");
                sendResponse({
                    status: "No tab ID found in message."
                });
            }
            break;
        default:
            console.log("Unhandled action:", message.action);
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

        case "getStoredProfileLinks":
            // Directly use sender.tab.id to access the tab ID from the sender of the message
            if (sender.tab && sender.tab.id) {
                const tabId = sender.tab.id;
                console.log(`Received request for stored profile links for tab ID: ${tabId}`);

                console.log(`Looking up profile links for tab ID: ${tabId}`);
                if (tabProfileLinks[tabId]) {
                    console.log(`Profile links found for tab ID ${tabId}:`, tabProfileLinks[tabId]);
                    sendResponse({
                        profileLinks: tabProfileLinks[tabId]
                    });
                } else {
                    console.log(`No profile links found for tab ID ${tabId}.`);
                    sendResponse({
                        error: "No profile links available for this tab."
                    });
                }
            } else {
                console.log("Error: Message sender does not have a valid tab context.");
                sendResponse({
                    error: "Message not sent from a valid tab."
                });
            }
            return true;



        case "getCurrentIndex":
            if (sender.tab && sender.tab.id && monitoredTabs[sender.tab.id]) {
                // Retrieve the current index from the monitoredTabs object
                const currentIndex = monitoredTabs[sender.tab.id].currentIndex;
                sendResponse({
                    currentIndex: currentIndex
                });
                console.log(`Sent current index ${currentIndex} for tab ID: ${sender.tab.id}`);
            } else {
                sendResponse({
                    error: "Tab ID is undefined or index not found"
                });
                console.error("Failed to retrieve current index for sender tab.");
            }
            break;



        case "updateIndex": {
            const tabId = sender.tab.id; // Get the tab ID from the message sender
            const windowId = sender.tab.windowId; // Get the window ID from the message sender

            // Check if the tab ID is already monitored, and update or initialize its index
            if (!monitoredTabs[tabId]) {
                monitoredTabs[tabId] = {
                    injected: false, // assuming you might also track if content scripts are injected
                    navigatedByExtension: true, // flag for navigation checks
                    currentIndex: message.newIndex, // set the new index from the message
                    windowId: windowId // store the window ID
                };
            } else {
                // Update the existing entry with the new index
                monitoredTabs[tabId].currentIndex = message.newIndex;
            }

            console.log(`Index updated to ${message.newIndex} for tab ${tabId} in window ${windowId}.`);
            const updatedIndex = monitoredTabs[tabId].currentIndex
            // Optionally, respond back to the content script if needed
            sendResponse({
                status: "Index updated",
                newIndex: updatedIndex
            });
        }
        return true;



        case "setPageNavigatedByExtensionFlag":
            // Check if the sender has a tab object and an ID
            if (sender.tab && sender.tab.id) {
                let tabId = sender.tab.id; // This is the tab ID from which the message was sent
                // Now you can use tabId to perform actions on this tab
                // For instance, setting a flag specific to this tab in monitoredTabs
                if (!monitoredTabs[tabId]) {
                    monitoredTabs[tabId] = {}; // Initialize as an empty object if it does not exist
                }
                // Set or update the pageNavigatedByExtension flag
                monitoredTabs[tabId].pageNavigatedByExtension = message.flag;
                console.log(`Flag pageNavigatedByExtension set to ${message.flag} for tab: ${tabId}`);

                // Sending a response back to content script if necessary
                sendResponse({
                    status: 'Flag set for PageNavigatedByExtension',
                    tabId: tabId
                });
            } else {

            }
            return true; // Keep the messaging channel open for the sendResponse callback



        case "setNavigatedByExtensionFlag":
            // Check if the sender has a tab object and an ID
            if (sender.tab && sender.tab.id) {
                let tabId = sender.tab.id; // This is the tab ID from which the message was sent
                // Ensure the tab entry exists or initialize it
                if (!monitoredTabs[tabId]) {
                    monitoredTabs[tabId] = {}; // Initialize as an empty object if it does not exist
                }
                // Set or update the navigatedByExtension flag
                monitoredTabs[tabId].navigatedByExtension = message.flag;
                console.log(`Flag navigatedByExtension set to ${message.flag} for tab: ${tabId}`);

                // Sending a response back to content script if necessary
                sendResponse({
                    status: 'navigatedByExtension flag set',
                    tabId: tabId
                });

                // Log the current state after updating
                console.log(`Current state of monitoredTabs for tabId ${tabId}:`, monitoredTabs[tabId]);
            } else {
                console.error('No tab ID found in the sender information');
            }
            return true; // Keep the messaging channel open for the sendResponse callback



        case "setInjectedFlag":
            // Check if the sender has a tab object and an ID
            if (sender.tab && sender.tab.id) {
                let tabId = sender.tab.id; // This is the tab ID from which the message was sent
                // Now you can use tabId to perform actions on this tab
                // For instance, setting a flag specific to this tab in monitoredTabs
                if (!monitoredTabs[tabId]) {
                    monitoredTabs[tabId] = {}; // Initialize as an empty object if it does not exist
                }
                // Set or update the navigatedByExtension flag
                monitoredTabs[tabId].injected = message.flag;
                console.log(`Flag injected set to ${message.flag} for tab: ${tabId}`);

                // Sending a response back to content script if necessary
                sendResponse({
                    status: 'injected Flag set',
                    tabId: tabId
                });
            } else {
                console.error('No tab ID found in the sender information');
            }
            return true; // Keep the messaging channel open for the sendResponse callback

    }
    return true; // Keep the messaging channel open for the sendResponse callback


});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (monitoredTabs[tabId]) {
        delete monitoredTabs[tabId];
        console.log(`Monitoring stopped and data cleared for Tab ID: ${tabId}`);
    }
});

// Listener function to monitor if tab navigated to jobs page or jobs page was invalid and produced new search results page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        // Clear any previous timeout to handle rapid successive updates
        if (stabilizationTimeouts[tabId]) {
            clearTimeout(stabilizationTimeouts[tabId]);
        }

        // Set a new timeout to ensure the changes are stable before taking action
        stabilizationTimeouts[tabId] = setTimeout(() => {
            // console.log(`Page has completed loading on tab ${tabId}. URL: ${tab.url}`);


            if (monitoredTabs[tabId]) {
                const navigatedByExtension = monitoredTabs[tabId]?.navigatedByExtension;
                const pageNavigatedByExtension = monitoredTabs[tabId]?.pageNavigatedByExtension;
                console.log(`Current state for Tab ${tabId}:`, monitoredTabs[tabId]);
                if (tab.url.includes('/search/results/') || tab.url.includes('/company/unavailable/')) {
                    console.log(`Received pageNavigatedByExtension flag for ${tabId}: ${pageNavigatedByExtension}`);
                    if (pageNavigatedByExtension) {
                        // Inject script if pageNavigatedByExtension is true
                        console.log(`Page navigation recognized as legitimate in Tab ${tabId}. Injecting content script.`);
                        injectScript(tabId);
                        monitoredTabs[tabId].pageNavigatedByExtension = false; // Reset flag after handling
                    } else if (navigatedByExtension) {
                        // Close tab and advance index if navigatedByExtension is true
                        console.log(`Navigation recognized as extension-triggered in Tab ${tabId}. Closing tab and advancing index.`);
                        closeTabAndAdvanceIndex(tabId);
                    } else {
                        // Log and reset if none are true
                        console.log(`Navigation to a search page detected without flags in Tab ${tabId}.`);

                    }
                }

                if (tab.url.includes('/jobs') && !monitoredTabs[tabId].injected) {
                    // If the URL is a jobs page and content script has not been injected yet
                    console.log(`Stabilized URL '${tab.url}' for Tab ${tabId}. Injecting content script.`);
                    injectScript(tabId);
                    monitoredTabs[tabId].injected = true; // Mark as injected to prevent further injections
                }
            }
        }, STABILIZATION_DELAY)
    }
});


function logKnownEmployees() {
    chrome.storage.local.get('knownEmployees', (data) => {
        if (data.knownEmployees) {
            console.log("Current knownEmployees:", JSON.stringify(data.knownEmployees, null, 2));
        } else {
            console.log("No known Employees found in storage.");
        }
    });
}
