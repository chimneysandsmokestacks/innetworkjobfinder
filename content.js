console.log("Content script execution started.");

if (typeof currentURL === 'undefined') {
    var currentURL = window.location.href; // Use 'var' for a more forgiving scope handling
}




chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // let currentURL = currentURL || window.location.href; // Declare and initialize currentURL if not already defined
    if (typeof currentURL === "undefined") {
        currentURL = window.location.href; // Initialize currentURL if it's undefined
    }
    // console.log(`Message received on URL: ${currentURL}`); // Log the URL for debugging

    if (message.action === "setCurrentIndex" && currentURL.includes('linkedin.com/search/results/')) {
        console.log(`Received setCurrentIndex with index: ${message.index} on search results page.`);
        openNextProfile(message.index);
        sendResponse({status: 'Index received and processed on search results page'});
    } 
});






function sendPauseMessageToBackground(duration) {
    sendMessageToBackground({ action: "logPause", duration: duration });
}

function sendMessageToBackground(message) {
    chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Error sending message to background script:', chrome.runtime.lastError);
        } else {
            console.log('Received response from background script:', response);
        }
    });
}

function randomPause(callback) {
    const randomTime = Math.floor(Math.random() * 4000) + 4000; // Random time between 2 and 4 seconds
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
                console.log(`Company name found at +${i} from company logo:`, spanElement.innerText.trim());
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
            console.log(`Alternative element found at +${i} from company logo, truncated name:`, companyName);
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
                const nameElement = document.querySelector('h1.text-heading-xlarge');
                const personName = nameElement ? nameElement.innerText.trim() : "Unknown Name";
                console.log('Extracted Person Name:', personName);

                // Extract company names using the helper function
                const companyNames = extractCompanyNameFromProfile(companyLink);
                console.log('Company names extracted from profile:', companyNames.join(', '));

                chrome.storage.local.get(['recentlyCheckedCompanies', 'knownEmployees'], data => {
                    const recentlyCheckedCompanies = data.recentlyCheckedCompanies || [];
                    const knownEmployees = data.knownEmployees || [];
                    let matchedCompanyName = null;


                    // Check if any of the extracted company names are known
                    const knownCompany = companyNames.some(name => {
                        return recentlyCheckedCompanies.some(comp => {
                            if (comp.name === name) {
                                matchedCompanyName = name; // Store the name that matched
                                return true;
                            }
                            return false;
                        });
                    });
                    console.log('Is the company known?', knownCompany);

                    if (knownCompany && matchedCompanyName) {
                        console.log(`Known company from profile. Skipping detailed job search for ${matchedCompanyName}.`);
                        // Record this visit
                        knownEmployees.push({
                            personName: personName,
                            personURL: window.location.href,
                            companyName: matchedCompanyName,
                            discoveredAt: new Date().toISOString()
                        });
                        // Update the known employees list in storage
                        chrome.storage.local.set({ knownEmployees }, () => {
                            console.log("Employee details updated in storage.");
                            sendMessageToBackground({ action: "closeCurrentTab" });
                        });

                    } else {
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

                        console.log("Messages sent successfully.");


                        // Extract the person's job title using a relative index
                        const jobTitleElements = document.querySelectorAll('div.display-flex.flex-wrap.align-items-center.full-height');
                        const companyElementIndex = Array.from(jobTitleElements).indexOf(companyLink.closest('div.display-flex.flex-wrap.align-items-center.full-height')) + 3; // Ensure correct offset
                        const jobTitleElement = jobTitleElements[companyElementIndex];
                        const personjobTitle = jobTitleElement ? jobTitleElement.querySelector('span[aria-hidden="true"]').innerText.trim() : "Unknown Title";
                        console.log('Extracted Job Title:', personjobTitle);


                        // Save profile details
                        chrome.storage.local.set({
                            profileUrl: window.location.href,
                            personName: personName,
                            personjobTitle: personjobTitle,
                        }, () => {
                            console.log('Profile details saved. Navigating to company jobs page.');
                            randomPause(() => {
                             window.location.href = `${companyLink.href}/jobs`;
                            });
                        });
                    }
                });
            }, 1000); // Delay for the UI to update
        } else {
            console.log("No company link found on profile page.");
            sendMessageToBackground({ action: "closeCurrentTab" });
        }
    });
}



function waitForElement(selector, callback, index = null, timeout = 3000) {
    // Log whether an index has been received
    if (index !== null) {
        console.log(`Received index number: ${index}`);
    } else {
        console.log("No index received");
    }
    console.log(`Checking for elements with selector: ${selector}.`);
    const interval = setInterval(() => {
        const elements = document.querySelectorAll(selector);
        console.log(`Found ${elements.length} elements matching selector: ${selector}.`);

        // Check if a specific index is requested and if the element at that index exists
        if (index !== null && elements.length > index) {
            console.log(`Element at index ${index} found: ${selector}, href: ${elements[index].href}`);
            clearInterval(interval);
            clearTimeout(failSafeTimeout);
            callback(elements[index]);
        } else if (index === null && elements.length > 0) {
            // If no specific index is requested, use the first found element
            console.log(`Element found: ${selector}`);
            console.log(`Executing callback for the first element matching selector: ${selector}`);
            clearInterval(interval);
            clearTimeout(failSafeTimeout);
            callback(elements[0]);
        } else {
            // If no elements are found, log that the element is not found yet
            console.log(`Elements matching selector: '${selector}' not found at this time.`);
        }
    }, 1000);

    // Set a failsafe timeout in case the element is never found
    const failSafeTimeout = setTimeout(() => {
        console.log(`Timeout reached without finding element for selector: ${selector}`);
        clearInterval(interval);
        callback(null);  // Indicate that no element was found
    }, timeout);
}




function handleCompanyPage() {
    chrome.storage.local.get(['profileUrl', 'personName', 'personjobTitle', 'jobTitleSetByUser', 'recentlyCheckedCompanies'], (data) => {
        console.log(`Searching for job title: ${data.jobTitleSetByUser}`);


        // chrome.runtime.sendMessage({ // sending it to background.js
        //     action: "logSearchJobTitle",
        //     jobTitle: data.jobTitleSetByUser
        // });

        const now = new Date().getTime();
        const companyNameElement = document.querySelector('.ember-view.org-top-card-summary__title');
        const companyName = companyNameElement ? companyNameElement.innerText.trim() : "Unknown Company";
        console.log("Company name extracted:", companyName);

        // Check if the company has been recently checked
        if (data.recentlyCheckedCompanies) {
            const recentlyChecked = data.recentlyCheckedCompanies.some(comp => comp.name === companyName && (now - comp.timestamp) < 86400000);
            console.log(`Is ${companyName} recently checked? ${recentlyChecked}`);
            if (recentlyChecked) {
                console.log(`Recently checked company ${companyName}. Skipping page.`);
                chrome.runtime.sendMessage({
                    action: "logInfo",
                    message: `Recently checked company ${companyName}. Skipping page.`
                });
              sendMessageToBackground({ action: "closeCurrentTab" });
                return; // Exit the function early to skip further processing
            }
        } else {
            console.log("No companies found in recently checked list.");
        }

        // Continue to process the job postings only if the company has not been checked recently
        if (data.profileUrl) {
            scrollToElement('.job-card-square__title');
            waitForElement('.job-card-square__title', jobCard => {
                if (jobCard === null) {
                    console.log("No job elements found on the company's jobs page. Closing tab.");
               sendMessageToBackground({ action: "closeCurrentTab" });
                } else {
                    const jobTitleSpan = jobCard.querySelector('span');
                    console.log('jobTitleSpan:', jobTitleSpan);



                    // First, find the common parent element by moving up from the jobCard
                    const parentElement = jobCard.closest('.flex-grow-1.job-card-square__text-container.artdeco-entity-lockup__content.ember-view');
                    console.log('parentElement:', parentElement);

                    // Now find the job location element within that parent element
                    const jobLocationElement = parentElement.querySelector('.job-card-container__metadata-wrapper'); // Adjust this selector if needed
                    console.log('jobLocationElement:', jobLocationElement);

                    const jobLocation = jobLocationElement ? jobLocationElement.textContent.trim() : "Unknown Location";
                    console.log('Job Location Text:', jobLocation);



                    if (jobTitleSpan && jobTitleSpan.textContent.includes(data.jobTitleSetByUser)) {
                        const jobTitleText = jobTitleSpan.textContent.trim();
                        const jobUrl = jobCard.closest('a').href;
                        console.log(`Found ${data.jobTitleSetByUser} job at ${companyName}: ${jobTitleText}, located in ${jobLocation} - URL: ${jobUrl}`);
                        // Update recently checked companies
                        console.log('Current companies before update:', data.recentlyCheckedCompanies);
                        const updatedCompanies = data.recentlyCheckedCompanies || [];
                        updatedCompanies.push({ name: companyName, timestamp: now });
                        chrome.storage.local.set({ 'recentlyCheckedCompanies': updatedCompanies }, () => {
                            console.log(`Updated recently checked companies with ${companyName} at ${new Date(now).toLocaleString()}.`);
                        });

                        // Send the job details along with the company name and the profile URL to background.js
                        const messagePayload = {
                            action: "foundJob",
                            profileUrl: data.profileUrl,
                            personName: data.personName,
                            personjobTitle: data.personjobTitle,
                            companyName: companyName,
                            jobTitleText: jobTitleText,
                            jobUrl: jobUrl,
                            jobLocation: jobLocation
                        };

                        console.log("Sending data to background.js:", messagePayload);
                        sendMessageToBackground(messagePayload);
                       
                        randomPause(() => {
                        sendMessageToBackground({ action: "closeCurrentTab" });
                        });
                    } else {
                         // Update recently checked companies
                        console.log('Current companies before update:', data.recentlyCheckedCompanies);
                        const updatedCompanies = data.recentlyCheckedCompanies || [];
                        updatedCompanies.push({ name: companyName, timestamp: now });
                        chrome.storage.local.set({ 'recentlyCheckedCompanies': updatedCompanies }, () => {
                            console.log(`Updated recently checked companies with ${companyName} at ${new Date(now).toLocaleString()}.`);
                        });
                        console.log(`Found job card element but it's not a ${data.jobTitleSetByUser} role. Closing tab.`);
                        sendMessageToBackground({ action: "closeCurrentTab" });
                    }
                }   
            });
        }
    });
}



function scrollToElement(selector) {
    const element = document.querySelector(selector);
    if (element) {
        element.scrollIntoView({
            behavior: 'smooth',  // Scroll smoothly to the element
            block: 'center',        // Vertical alignment of the element within the viewport
            inline: 'nearest'    // Horizontal alignment of the element within the viewport
        });
        console.log(`Scrolled smoothly to the element with selector: ${selector}`);
    } else {
        console.log(`Element with selector ${selector} not found.`);
    }
}

// function simulateScrollPageFinder() {
//     // Scroll down by the height of the window (viewport)
//     window.scrollBy(4000, window.innerHeight);
//     console.log(`Scrolled down by ${window.innerHeight}px to trigger lazy-loaded elements.`);
// }




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
            // Now parse the profile links after the page content has likely loaded
            const allProfileLinks = Array.from(document.querySelectorAll('.entity-result__title-text a.app-aware-link'))
                                         .map(link => link.href)
                                         .filter(href => href.includes('www.linkedin.com/in/'));

            // Define the message to be sent
            const message = {
                action: "storeProfileLinks",
                profileLinks: allProfileLinks
            };

            // Log the message before sending it
            console.log("Sending to background:", message);

            // Store the scanned profile links in local storage associated with the tab ID
            chrome.runtime.sendMessage(message, function(response) {
                if (response && response.status === "Profile links stored successfully") {
                    if (typeof callback === "function") {
                        callback(); // Call the openNextProfile function as a callback
                    }
                } else {
                    console.error("Failed to store profile links:", response.error);
                }
            });
        }, 2000);  // Wait sufficient time after scrolling back to the top
    }, 2000);  // Wait sufficient time after scrolling to the bottom
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
                const selector = `.entity-result__title-text a[href='${profileLink}']`;

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
                        sendMessageToBackground({action: "openNewTab", url: profileLink});
                    }
                }, 1000);  // Delay to simulate UI update
            } else {
                console.log(`No profile link found at index: ${index}. Attempting to navigate to the next page.`);
                sendMessageToBackground({ action: "storeProfileLinks", profileLinks: [] });
                clickNextPage();  // This function may also need adjustment for context-specific actions
            }
        })
    } 
    else {
            console.log("Profile links not found or the response from background is incorrect.");
            scanProfileElementsAndStore( () => openNextProfile(index));  // Recursive call after scanning
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
        if (response && response.status === "success") {
            console.log(`Index incremented to ${nextIndex}, continuing to next profile.`);
            openNextProfile(response.newIndex);  // Recursively call to continue with the next profile
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

                    // // Update navigatedByExtension flag locally (in memory)
                    // if (typeof monitoredTabs === 'undefined') {
                    //     monitoredTabs = {}; // Ensure monitoredTabs is defined
                    // }
                    // monitoredTabs[currentTabId] = { navigatedByExtension: true }; // Assuming currentTabId is known

                    // Send message to background.js to update the index
                    
                } else {
                    console.log('No next page button available or it is disabled.');
                }
            }, 2000); // Wait for 2 seconds to ensure the scroll has completed and elements are interactable
        } else {
            console.log('Current page button not found.');
        }
    }, 2000); // Initial delay after scrolling to ensure elements load
}






// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     // const currentURL = window.location.href; // Get the current URL of the tab where the script is running
//     console.log(`Message received on URL: ${currentURL}`); // Log the URL for debugging

//     if (message.action === "setCurrentIndex" && currentURL.includes('linkedin.com/search/results/')) {
//         console.log(`Received setCurrentIndex with index: ${message.index} on search results page.`);
//         openNextProfile(message.index);
//         sendResponse({status: 'Index received and processed on search results page'});
//     } 
// });





// const currentURL = window.location.href;
// console.log(`Current URL: ${currentURL}`);

// console.log(`Evaluating URL for function routing: ${currentURL}`);

if (currentURL.includes('linkedin.com/search/results/')) {
    // Send a message to the background script to get the current index
    chrome.runtime.sendMessage({action: "getCurrentIndex"}, (response) => {
        if (response && response.currentIndex != null) {
            console.log("It's a search page. Retrieved current index:", response.currentIndex);
            openNextProfile(response.currentIndex);
        } else {
            console.error("Failed to retrieve current index or response is undefined.");
        }
    });
} else if (currentURL.includes('linkedin.com/in/')) {
    handleProfilePage();
    console.log("It's a profile page. Initiating handleProfilePage");
} else if (currentURL.includes('linkedin.com/company/')) {
    handleCompanyPage();
    console.log("It's a company page. Initiating handleCompanyPage");
} else if (currentURL.includes('linkedin.com/school/')) {
    handleCompanyPage(); // This should probably be handleSchoolPage() if it differs from company handling.
    console.log("It's a school page. Initiating handleCompanyPage");
} else {
    console.log("URL doesn't match expected patterns.");
}
