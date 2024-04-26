console.log("Content script started.");

if (typeof currentURL === 'undefined') {
    var currentURL = window.location.href; // Use 'var' for a more forgiving scope handling
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // let currentURL = currentURL || window.location.href; 
    if (typeof currentURL === "undefined") {
        currentURL = window.location.href; // Initialize currentURL if it's undefined
    }
    // console.log(`Message received on URL: ${currentURL}`); // Log the URL for debugging
    if (message.action === "setCurrentIndex" && currentURL.includes('/search/results/')) {
        console.log(`Received setCurrentIndex with index: ${message.index} on search results page.`);
        openNextProfile(message.index);
        sendResponse({
            status: 'Index received and processed on search results page'
        });
    }
});


function sendPauseMessageToBackground(duration) {
    sendMessageToBackground({
        action: "logPause",
        duration: duration
    });
}

function sendMessageToBackground(message) {
    chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
            console.log ('Error sending message to background script:', chrome.runtime.lastError);
        } else {
            console.log('Received response from background script:', response);
        }
    });
}

function randomPause(callback) {
    const randomTime = Math.floor(Math.random() * 4000) + 4000; // Random time between 4 and 8 seconds
    const seconds = (randomTime / 1000).toFixed(2);
    sendPauseMessageToBackground(seconds);
    setTimeout(callback, randomTime);
}

function extractCompanyNameFromProfile(companyLink) {
    // Attempt to find the company name from the known index after the company logo
    const jobTitleElements = document.querySelectorAll('div.display-flex.flex-wrap.align-items-center.full-height');
    let companyElementIndex = Array.from(jobTitleElements).indexOf(companyLink.closest('div.display-flex.flex-wrap.align-items-center.full-height'));
    // console.log("Index of the company logo element:", companyElementIndex);


    // We'll collect possible company names from the first two elements after the company logo
    let possibleCompanyNames = [];
    for (let i = 1; i <= 2; i++) {
        if (companyElementIndex + i < jobTitleElements.length) {
            const jobTitleElement = jobTitleElements[companyElementIndex + i];
            const spanElement = jobTitleElement ? jobTitleElement.querySelector('span[aria-hidden="true"]') : null;
            if (spanElement) {
                //           console.log(`Company name found at +${i} from company logo:`, spanElement.innerText.trim());
                possibleCompanyNames.push(spanElement.innerText.trim());
            } else {
                console.log(`No company name span found at +${i} from company logo.`);
            }
        }
    }

    // Also check the first and second 'span.t-14.t-normal > span[aria-hidden="true"]' elements after the company logo
    const alternativeElements = document.querySelectorAll('span.t-14.t-normal > span[aria-hidden="true"]');
    for (let i = 1; i <= 2; i++) {
        const alternativeElementIndex = companyElementIndex + i;
        if (alternativeElementIndex < alternativeElements.length) {
            const alternativeElement = alternativeElements[alternativeElementIndex];
            if (alternativeElement) {
                let companyName = alternativeElement.innerText.trim();
                // Truncate the companyName at the first dot
                companyName = companyName.includes('·') ? companyName.split('·')[0].trim() : companyName;
                //   console.log(`Alternative element found at +${i} from company logo, truncated name:`, companyName);
                possibleCompanyNames.push(companyName);
            } else {
                console.log(`No alternative company name found at +${i} from company logo.`);
            }
        }
    }

    // Return the possible company names if any are found, or "Unknown Company" if none are found
    return possibleCompanyNames.length > 0 ? possibleCompanyNames : ["Unknown Company"];
}



function handleProfilePage() {
    waitForElement('a[data-field="experience_company_logo"]', companyLink => {
        if (companyLink) {
            scrollToElement('a[data-field="experience_company_logo"]');
            setTimeout(() => {

                //extract person's name
                const nameElement = document.querySelector('h1.text-heading-xlarge');
                const personName = nameElement ? nameElement.innerText.trim() : "Unknown Name";
                console.log('Extracted Person Name:', personName);

                // Extract list of potential company names using the helper function
                const companyNames = extractCompanyNameFromProfile(companyLink);
                console.log('Company names extracted from profile:', companyNames.join(', '));

                //get recently checked companies and known employees
                chrome.storage.local.get(['recentlyCheckedCompanies', 'knownEmployees'], data => {
                    const recentlyCheckedCompanies = data.recentlyCheckedCompanies || [];
                    let knownEmployees = data.knownEmployees || [];

                    let matchedCompanyName = null;
                    let skipDetailedSearch = false;

                    const knownCompany = companyNames.some(name => {
                        return recentlyCheckedCompanies.some(comp => {
                            if (comp.name === name) {
                                const timeDiff = Date.now() - new Date(comp.timestamp).getTime();
                                if (timeDiff <= 43200000) {
                                    matchedCompanyName = name;
                                    console.log(`Company '${name}' was checked within the last 24 hours. Time since last check: ${timeDiff} ms.`);
                                    skipDetailedSearch = true;
                                    return true;
                                } else {

                                }
                            }
                            return false;
                        });
                    });
                    console.log(`Compared against ${recentlyCheckedCompanies.length} companies, skip detailed search: ${skipDetailedSearch}`);

                    // Update knownEmployees regardless of whether we skip or not
                    knownEmployees.push({
                        personName: personName,
                        personURL: window.location.href,
                        companyName: matchedCompanyName || "Unknown Company",
                        discoveredAt: new Date().toISOString()
                    });
                    chrome.storage.local.set({
                        knownEmployees
                    }, () => {
                        console.log('Employee details updated in storage', knownEmployees);
                    });

                    if (skipDetailedSearch) {
                        console.log(`Skipping detailed job search for ${matchedCompanyName}. Closing tab.`);
                        sendMessageToBackground({
                            action: "closeCurrentTab"
                        });
                    }


                    // if company name has not been seen prepare to navigate to jobs page
                    else {
                        console.log("Sending message to setNavigatedByExtensionFlag");
                        sendMessageToBackground({
                            action: "setNavigatedByExtensionFlag",
                            flag: true
                        });

                        console.log("Sending message to setInjectedFlag");
                        sendMessageToBackground({
                            action: "setInjectedFlag",
                            flag: false
                        });

                        // Extract the person's job title using a relative index
                        const jobTitleElements = document.querySelectorAll('div.display-flex.flex-wrap.align-items-center.full-height');
                        const companyElementIndex = Array.from(jobTitleElements).indexOf(companyLink.closest('div.display-flex.flex-wrap.align-items-center.full-height')) + 3; // Ensure correct offset
                        const jobTitleElement = jobTitleElements[companyElementIndex];
                        const personjobTitle = jobTitleElement ? jobTitleElement.querySelector('span[aria-hidden="true"]').innerText.trim() : "Unknown Title";
                        console.log('Extracted Job Title:', personjobTitle);



                        chrome.storage.local.set({
                            profileUrl: window.location.href,
                            personName: personName,
                            personjobTitle: personjobTitle,
                            companyLink: companyLink.href
                        }, () => {
                            console.log('Profile details saved to storage temporarily. Navigating to company jobs page.');
                            randomPause(() => {
                                window.location.href = `${companyLink.href}/jobs`;
                            });
                        });
                    }
                });
            }, 1000); // Delay for the UI to update
        } else {
            console.log("No company link found on profile page.");
            sendMessageToBackground({
                action: "closeCurrentTab"
            });
        }
    }, 0); // passes index 0 to waitforelement so that waitforelement only returns one (the first one)
}


function waitForElement(selector, callback, index = null, timeout = 3000) {
    // Log whether an index has been received
    if (index !== null) {
        console.log(`Received index number: ${index}`);
    } else {
        //    console.log("No index received");
    }
    // console.log(`Checking for elements with selector: ${selector}.`);
    const interval = setInterval(() => {
        const elements = document.querySelectorAll(selector);
        // console.log(`Found ${elements.length} elements matching selector: ${selector}.`);

        // Check if a specific index is requested and if the element at that index exists
        if (index !== null && elements.length > index) {
            console.log(`Element at index ${index} found: ${selector}, href: ${elements[index].href}`);
            clearInterval(interval);
            clearTimeout(failSafeTimeout);
            callback(elements[index]);
        } else if (index === null && elements.length > 0) {
            // If no specific index is requested, use the first found element
            //  console.log(`Element found: ${selector}`);
            //  console.log(`Executing callback for the first element matching selector: ${selector}`);
            clearInterval(interval);
            clearTimeout(failSafeTimeout);
            callback(Array.from(elements));
        } else {
            // If no elements are found, log that the element is not found yet
            // console.log(`Elements matching selector: '${selector}' not found at this time.`);
        }
    }, 1000);

    // Set a failsafe timeout in case the element is never found
    const failSafeTimeout = setTimeout(() => {
        //   console.log(`Timeout reached without finding element for selector: ${selector}`);
        clearInterval(interval);
        callback(null); // Indicate that no element was found
    }, timeout);
}


function handleCompanyPage() {
    chrome.storage.local.get(['profileUrl', 'personName', 'personjobTitle', 'jobTitleSetByUser', 'recentlyCheckedCompanies', 'knownEmployees'], (data) => {
        console.log(`Searching for job title: ${data.jobTitleSetByUser}`);
        console.log(`Retrieved from temporary storage-- profileURL: ${data.profileUrl}, ${data.personName}, ${data.personjobTitle}`);

        const now = new Date().getTime();
        const companyNameElement = document.querySelector('.ember-view.org-top-card-summary__title');
        const companyName = companyNameElement ? companyNameElement.innerText.trim() : "Unknown Company";
        const knownEmployees = data.knownEmployees
        console.log("Company name extracted:", companyName);
        if (!Array.isArray(knownEmployees)) {
            console.error('knownEmployees is not an array:', data.knownEmployees)
        } else {
            console.log('knownEmployees is an array:', data.knownEmployees)
        };

        // Update the companyName for the current employee in knownEmployees
        if (data.knownEmployees && data.profileUrl) {
            let employeeExists = false;
            // Iterate over knownEmployees to find and update the existing entry
            knownEmployees.forEach(employee => {
                if (employee.personURL === data.profileUrl) {
                    employeeExists = true;
                    employee.companyName = companyName;
                    employee.lastSeen = new Date().toISOString(); // Update last seen time if necessary
                    console.log(`Updated company name for ${employee.personName} to ${companyName} in storage.`);
                }
            });

            // If no existing employee was found, add a new one
            if (!employeeExists) {
                knownEmployees.push({
                    personName: data.personName,
                    personURL: data.profileUrl,
                    companyName: companyName,
                    discoveredAt: new Date().toISOString(),
                    lastSeen: new Date().toISOString() // This ensures the new entry has a last seen time
                });
                console.log('Added new employee:', data.personName);
            }

            // Save the updated knownEmployees back to storage
            chrome.storage.local.set({
                knownEmployees
            }, () => {
                if (!Array.isArray(knownEmployees)) {
                    console.error('New details stored, but knownEmployees is not an array:', data.knownEmployees)
                } else {
                    console.log('New details stored, knownEmployees is an array:', data.knownEmployees)
                };
            });
        } else {
            console.log("Didn't update company name for existing employee")
        }


        extractJobFromCompanyPage();

    });
}


function extractJobFromCompanyPage() {
    waitForElement('.job-card-square__title', jobCards => {
        if (!jobCards) {
            console.log("No job elements found on the company's jobs page. Closing tab.");
            sendMessageToBackground({
                action: "closeCurrentTab"
            });
        } else {
            console.log('waitForElement returned:', jobCards);
            scrollToElement('.job-card-square__title');
            if (!jobCards.length) {
                console.log("No job elements found on the company's jobs page. Closing tab.");
                sendMessageToBackground({
                    action: "closeCurrentTab"
                });
        } else {
            chrome.storage.local.get(['profileUrl', 'personName', 'personjobTitle', 'companyLink', 'jobTitleSetByUser', 'recentlyCheckedCompanies'], (data) => {
                jobCards.forEach(jobCard => {
                    const jobTitleSpan = jobCard.querySelector('span');
                    const jobTitleText = jobTitleSpan ? jobTitleSpan.textContent.trim() : '';
                    const jobUrl = jobCard.closest('a').href;
                    const parentElement = jobCard.closest('.flex-grow-1.job-card-square__text-container.artdeco-entity-lockup__content.ember-view');
                    const jobLocationElement = parentElement.querySelector('.job-card-container__metadata-wrapper');
                    const jobLocation = jobLocationElement ? jobLocationElement.textContent.trim() : "Unknown Location";
                    const jobTitlesUser = data.jobTitleSetByUser.split(',').map(title => title.trim());
                    console.log('Comparing against job title', jobTitlesUser);
                    const isJobFound = jobTitlesUser.some(userTitle => jobTitleText.includes(userTitle));
                    const companyNameElement = document.querySelector('.ember-view.org-top-card-summary__title');
                    const companyName = companyNameElement ? companyNameElement.innerText.trim() : "Unknown Company";
                    console.log('Checking job:', jobTitleText, 'in', jobLocation);

                    const updatedCompanies = data.recentlyCheckedCompanies || [];
                    updatedCompanies.push({
                        name: companyName,
                        timestamp: Date.now()
                    }); // Assuming companyName is meant to be jobLocation
                    chrome.storage.local.set({
                        'recentlyCheckedCompanies': updatedCompanies
                    }, () => {
                        console.log('Current companies before update:', updatedCompanies);
                        console.log(`Updated recently checked companies with ${companyName} at ${new Date(Date.now()).toLocaleString()}.`);
                    });

                    if (isJobFound) {
                        console.log(`Found matching job: ${jobTitleText}, located in ${jobLocation} - URL: ${jobUrl}`);


                        const messagePayload = {
                            action: "foundJob",
                            companyLink: data.companyLink,
                            profileUrl: data.profileUrl,
                            personName: data.personName,
                            personjobTitle: data.personjobTitle,
                            companyName: companyName,
                            jobTitleText: jobTitleText,
                            jobUrl: jobUrl,
                            jobLocation: jobLocation
                        };
                        sendMessageToBackground(messagePayload);
                    } 
                });
                // Close the tab after all job cards have been processed
                randomPause(() => {
                    sendMessageToBackground({
                        action: "closeCurrentTab"
                    });
                });
            });
        }
    }
    });
}



function scrollToElement(selector) {
    const element = document.querySelector(selector);
    if (element) {
        element.scrollIntoView({
            behavior: 'smooth', // Scroll smoothly to the element
            block: 'center', // Vertical alignment of the element within the viewport
            inline: 'nearest' // Horizontal alignment of the element within the viewport
        });
        console.log(`Scrolled smoothly to the element with selector: ${selector}`);
    } else {
        console.log(`Element with selector ${selector} not found.`);
    }
}


function extractCompanyNameFromSearchPage(index) {
    // Find all profile headline elements
    const summaryElements = document.querySelectorAll('.entity-result__summary');
    console.log(`Total summary elements found: ${summaryElements.length}`);
    // console.log(`extractCompanyNameFromSearchPage says: Index ${index} received from openNextProfile.`);
    if (index >= 0 && index < summaryElements.length) {
        // Find the bolded company name within the headline, if it exists
        // console.log('Targeted summary element:', summaryElements[index]);
        const strongTag = summaryElements[index].querySelector('strong');
        const companyName = strongTag ? strongTag.innerText.trim() : null;
        // console.log("extractCompanyNameFromSearchPage says: Index received from openNextProfile and processing:", index);
        //  console.log(`Extracted company name from headline at index ${index}: ${companyName}`);
        return companyName;
    }

    console.log(`Headline for index ${index} not found.`);
    return null;
}


function scanProfileElementsAndStore(callback) {
    // Smoothly scroll to the bottom of the page
    window.scroll({
        top: document.body.scrollHeight,
        left: 0,
        behavior: 'smooth'
    });

    // Wait for the page to stabilize after scrolling down
    setTimeout(() => {
        // Smoothly scroll back to the top of the page
        window.scroll({
            top: 0,
            left: 0,
            behavior: 'smooth'
        });

        // Wait for the page to stabilize after scrolling up
        setTimeout(() => {
            // Fetch the knownEmployees from storage
            chrome.storage.local.get('knownEmployees', function(storageResult) {
                const knownEmployees = storageResult.knownEmployees || [];
                const updateEmployees = {};
                const toSend = [];
                const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                // Log the number of known profiles fetched
                console.log(`Fetched ${Object.keys(knownEmployees).length} known profiles from storage.`);

                // Parse profile links after the page content has likely loaded
                const allProfileLinks = Array.from(document.querySelectorAll('.entity-result__title-text a.app-aware-link'))
                    .map(link => link.href.split('?')[0].replace(/\/$/, '')) // Normalizes the URL and removes slashes
                    .filter(link => link.includes('/in/')); 
                // Log how many profile links were parsed
                console.log(`Parsed ${allProfileLinks.length} profile links from the page.`);
                console.log('Profile Links:', allProfileLinks); // Log parsed URLs

                let matchCount = 0;
                allProfileLinks.forEach(normalizedUrl => {
                    let found = false;
                    for (const key in knownEmployees) {
                        if (knownEmployees.hasOwnProperty(key)) {
                            const employee = knownEmployees[key];
                            const storedUrl = employee.personURL;
                            if (storedUrl) { // Ensure storedUrl is not undefined
                                const normalizedStoredUrl = storedUrl.replace(/\/$/, ''); // Normalize stored URL
                                if (normalizedStoredUrl === normalizedUrl) {
                                    const currentDateTime = new Date().toISOString();

                                    // Update lastSeen if it exists, otherwise check discoveredAt
                                    if (employee.lastSeen || new Date(employee.discoveredAt) >= oneWeekAgo) {
                                        employee.lastSeen = currentDateTime; // Update lastSeen to current time
                                        updateEmployees[key] = employee;
                                        found = true;
                                        matchCount++;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    if (!found) {
                        toSend.push(normalizedUrl); // Add URL to send if not found
                    }
                });
                console.log(`Found ${matchCount} matches between parsed links and known employees.`);

                // Define the message to be sent if there are profiles to store
                if (toSend.length > 0) {
                    const message = {
                        action: "storeProfileLinks",
                        profileLinks: toSend
                    };

                    // Log the message before sending it
                    console.log("Sending to background:", message);

                    // Store the scanned profile links in local storage associated with the tab ID
                    chrome.runtime.sendMessage(message, function(response) {
                        if (response && response.status === "Profile links stored successfully") {
                            if (typeof callback === "function") {
                                callback(); // Call the callback function
                            }
                        } else {
                            console.error("Failed to store profile links:", response.error);
                        }
                    });
                } else {
                    console.log("No new profiles to store or update needed.");
                    if (typeof callback === "function") {
                        callback(); // Still call the callback function
                    }
                }
            });
        }, 2000); // Wait sufficient time after scrolling back to the top
    }, 2000); // Wait sufficient time after scrolling to the bottom
}



function openNextProfile(index) {
    if (index == null || isNaN(index)) {
        console.error("Invalid tab ID or index:", tabId, index);
        return;
    }

    // Send a message to the background script to get the profile links for the specified tab ID
    chrome.runtime.sendMessage({
        action: "getStoredProfileLinks"
    }, function(response) {
        if (response && response.profileLinks && response.profileLinks.length > 0) {
            const profileLinks = response.profileLinks;

            // Retrieve recently checked companies from storage
            chrome.storage.local.get('recentlyCheckedCompanies', (data) => {
                const recentlyCheckedCompanies = data.recentlyCheckedCompanies || [];

                console.log("Current index retrieved:", index);
                if (index >= 0 && index < profileLinks.length) {
                    const profileLink = profileLinks[index];
                    const selector = `.entity-result__title-text a[href^='${profileLink}']`;

                    // Simulate the scrollToElement function if it's not available in the current context
                    console.log(`Scrolling to element with selector: ${selector}`);
                    scrollToElement(selector);

                    setTimeout(() => {
                        const headlineElement = document.querySelectorAll('.entity-result__primary-subtitle')[index].innerText.trim();
                        const companyNameInHeadline = headlineElement ? extractCompanyNameFromSearchPage(index) : null;
                        // console.log("Comparing extracted company name to stored company names:");
                        // recentlyCheckedCompanies.forEach(detail => console.log(detail.name));
                        if (companyNameInHeadline && recentlyCheckedCompanies.some(detail => detail.name === companyNameInHeadline)) {
                            console.log(`Skipping profile at index ${index} for known company: ${companyNameInHeadline}`);
                            chrome.runtime.sendMessage({
                                action: "logInfo",
                                message: `Skipping profile at index ${index} for known company: ${companyNameInHeadline}`
                            });
                            incrementIndexAndContinue(index);
                        } else {
                            console.log(`Opening profile URL at index ${index}: ${profileLink}`);
                            randomPause(() => {
                                sendMessageToBackground({
                                    action: "openNewTab",
                                    url: profileLink
                                });
                            });
                        }
                    }, 1000); // Delay to simulate UI update
                } else {
                    console.log(`No profile link found at index: ${index}. Attempting to navigate to the next page.`);
                    sendMessageToBackground({
                        action: "storeProfileLinks",
                        profileLinks: []
                    });
                    clickNextPage(); // This function may also need adjustment for context-specific actions
                }
            })
        } else {
            console.log("Profile links not yet scanned or the response from background is incorrect.");
            scanProfileElementsAndStore(() => openNextProfile(index)); // Recursive call after scanning
        }
    });
}



function incrementIndexAndContinue(currentIndex) {
    const nextIndex = currentIndex + 1;
    // Send a message to the background script to update the index
    chrome.runtime.sendMessage({
        action: "updateIndex",
        newIndex: nextIndex
    }, response => {
        if (response && response.status === 'Index updated') {
            console.log(`Index incremented to ${nextIndex}, continuing to next profile.`);
            openNextProfile(response.newIndex); // Recursively call to continue with the next profile
        } else {
            console.error("Failed to update index via background script.");
        }
    });
}

function clickNextPage() {
    console.log("Attempting to click the next page button...");

    window.scrollTo(0, document.body.scrollHeight);
    console.log(`Scrolling to pagination selector bottom of page.`);

    // Allow some time for the page to react and the elements to be properly visible
    setTimeout(() => {
        // Find all page buttons
        const pageButtons = document.querySelectorAll('ul.artdeco-pagination__pages > li > button');
        console.log(`Page buttons found: ${pageButtons.length}`);

        // Find the currently selected page button
        const currentPageButton = Array.from(pageButtons).find(button => button.getAttribute('aria-current') === 'true');

        if (currentPageButton) {
            console.log(`Current page button found: ${currentPageButton.innerText}`);

            // Use a slight delay after initial scroll to allow the DOM to update
            setTimeout(() => {
                // Re-find the current page button and calculate the next page button
                const refreshedPageButtons = document.querySelectorAll('ul.artdeco-pagination__pages > li > button');
                console.log(`Refreshed page buttons found: ${refreshedPageButtons.length}`);

                const refreshedCurrentPageButton = Array.from(refreshedPageButtons).find(button => button.getAttribute('aria-current') === 'true');
                const nextPageIndex = Array.from(refreshedPageButtons).indexOf(refreshedCurrentPageButton) + 1;
                const nextPageButton = refreshedPageButtons[nextPageIndex];

                if (nextPageButton && !nextPageButton.disabled) {
                    // Log the next page number to be clicked
                    const nextPageNumber = nextPageButton.getAttribute('aria-label').match(/\d+/)[0];
                    console.log(`Next page button found: ${nextPageNumber}`);
                    sendMessageToBackground({
                        action: "setPageNavigatedByExtensionFlag",
                        flag: true
                    });
                    chrome.runtime.sendMessage({
                        action: "updateIndex",
                        newIndex: 0 // Reset the index for the new page
                    }, response => {
                        if (response && response.status === 'Index updated') {
                            index = response.newIndex;
                            console.log(`Index updated to ${index}, navigating to next page:`, nextPageNumber);

                            // Upon successful index update, click the next page button
                            nextPageButton.click();
                            console.log(`Clicked to navigate to page number: ${nextPageNumber}`);
                        } else {
                            console.log('Failed to update index, navigation postponed.');
                        }
                    });

                } else {
                    console.log('No next page button available or it is disabled.');
                }
            }, 2000); // Wait for 2 seconds to ensure the scroll has completed and elements are interactable
        } else {
            console.log('Current page button not found.');
        }
    }, 2000); // Initial delay after scrolling to ensure elements load
}



// console.log(`Evaluating URL for function routing: ${currentURL}`);
if (currentURL.includes('/search/results/')) {
    // Send a message to the background script to get the current index
    chrome.runtime.sendMessage({
        action: "getCurrentIndex"
    }, (response) => {
        if (response && response.currentIndex != null) {
            console.log("It's a search page. Retrieved current index:", response.currentIndex);
            // injectStyles();
            // injectIframe();
            openNextProfile(response.currentIndex);
        } else {
            console.error("Failed to retrieve current index or response is undefined.");
        }
    });
} else if (currentURL.includes('/in/')) {
    handleProfilePage();
    console.log("It's a profile page. Initiating handleProfilePage");
} else if (currentURL.includes('/company/')) {
    handleCompanyPage();
    console.log("It's a company page. Initiating handleCompanyPage");
} else if (currentURL.includes('/school/')) {
    handleCompanyPage(); // This should probably be handleSchoolPage() if it differs from company handling.
    console.log("It's a school page. Initiating handleCompanyPage");
} else {
    console.log("URL doesn't match expected patterns.");
}
