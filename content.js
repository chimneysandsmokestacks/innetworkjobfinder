var DEBUG = false;

if (DEBUG) {
    console.log("Content script started.");
}

if (typeof currentURL === 'undefined') {
    var currentURL = window.location.href; 
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (typeof currentURL === "undefined") {
        currentURL = window.location.href; 
    }
    if (DEBUG) {console.log(`Message received on URL: ${currentURL}`);}
    if (message.action === "setCurrentIndex" && currentURL.includes('/search/results/')) {
        if (DEBUG) {
            console.log(`Received setCurrentIndex with index: ${message.index} on search results page.`);
        }
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
            if (DEBUG) {
                console.log('Error sending message to background script:', chrome.runtime.lastError);
            }
        } else {
            if (DEBUG) {
                console.log('Received response from background script:', response);
            }
        }
    });
}

function randomPause(callback) {
    const randomTime = Math.floor(Math.random() * 4000) + 4000; 
    const seconds = (randomTime / 1000).toFixed(2);
    sendPauseMessageToBackground(seconds);
    setTimeout(callback, randomTime);
}

function extractCompanyNameFromProfile(companyLink) {

    const jobTitleElements = document.querySelectorAll('div.display-flex.flex-wrap.align-items-center.full-height');
    let companyElementIndex = Array.from(jobTitleElements).indexOf(companyLink.closest('div.display-flex.flex-wrap.align-items-center.full-height'));
    if (DEBUG) {console.log("Index of the company logo element:", companyElementIndex);}

    let possibleCompanyNames = [];
    for (let i = 1; i <= 2; i++) {
        if (companyElementIndex + i < jobTitleElements.length) {
            const jobTitleElement = jobTitleElements[companyElementIndex + i];
            const spanElement = jobTitleElement ? jobTitleElement.querySelector('span[aria-hidden="true"]') : null;
            if (spanElement) {
                if (DEBUG) {console.log(`Company name found at +${i} from company logo:`, spanElement.innerText.trim());}
                possibleCompanyNames.push(spanElement.innerText.trim());
            } else {
                if (DEBUG) {
                    console.log(`No company name span found at +${i} from company logo.`);
                }
            }
        }
    }

    const alternativeElements = document.querySelectorAll('span.t-14.t-normal > span[aria-hidden="true"]');
    for (let i = 1; i <= 2; i++) {
        const alternativeElementIndex = companyElementIndex + i;
        if (alternativeElementIndex < alternativeElements.length) {
            const alternativeElement = alternativeElements[alternativeElementIndex];
            if (alternativeElement) {
                let companyName = alternativeElement.innerText.trim();

                companyName = companyName.includes('·') ? companyName.split('·')[0].trim() : companyName;
                if (DEBUG) {console.log(`Alternative element found at +${i} from company logo, truncated name:`, companyName);}
                possibleCompanyNames.push(companyName);
            } else {
                if (DEBUG) {
                    console.log(`No alternative company name found at +${i} from company logo.`);
                }
            }
        }
    }

    return possibleCompanyNames.length > 0 ? possibleCompanyNames : ["Unknown Company"];
}

function handleProfilePage() {
    waitForElement('a[data-field="experience_company_logo"]', companyLink => {
        if (companyLink) {
            scrollToElement('a[data-field="experience_company_logo"]');
            setTimeout(() => {

                const nameElement = document.querySelector('h1.text-heading-xlarge');
                const personName = nameElement ? nameElement.innerText.trim() : "Unknown Name";
                if (DEBUG) {
                    console.log('Extracted Person Name:', personName);
                }

                const companyNames = extractCompanyNameFromProfile(companyLink);
                if (DEBUG) {
                    console.log('Company names extracted from profile:', companyNames.join(', '));
                }

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
                                    const hours = Math.floor(timeDiff / 3600000); 
                                    const minutes = Math.floor((timeDiff % 3600000) / 60000); 
                                    const timeDiffDisplay = `${hours} hours and ${minutes} minutes`;
                                    sendMessageToBackground({
                                        action: "logInfo",
                                        info: `Skipping company '${name}' because it was already scanned in the last 12 hours`,
                                        duration: timeDiffDisplay
                                    });
                                    skipDetailedSearch = true;
                                    return true;
                                } else {
                                    const hours = Math.floor(timeDiff / 3600000); 
                                    const minutes = Math.floor((timeDiff % 3600000) / 60000); 
                                    const timeDiffDisplay = `${hours} hours and ${minutes} minutes`;
                                    if (DEBUG) {
                                        console.log(`Company '${name}' found in storage but last checked more than 12 hours ago. Time since last check: ${timeDiffDisplay}.`);
                                    }
                                }
                            }
                            return false;
                        });
                    });
                    if (DEBUG) {
                        console.log(`Compared against ${recentlyCheckedCompanies.length} companies, skip detailed search: ${skipDetailedSearch}`);
                    }

                    knownEmployees.push({
                        personName: personName,
                        personURL: window.location.href,
                        companyName: matchedCompanyName || "Unknown Company",
                        discoveredAt: new Date().toISOString()
                    });
                    chrome.storage.local.set({
                        knownEmployees
                    }, () => {
                        if (DEBUG) {
                            console.log('Employee details updated in storage', knownEmployees);
                        }
                    });

                    if (skipDetailedSearch) {
                        if (DEBUG) {
                            console.log(`Skipping detailed job search for ${matchedCompanyName}. Closing tab.`);
                        }
                        sendMessageToBackground({
                            action: "closeCurrentTab"
                        });
                    }

                    else {
                        if (DEBUG) {
                            console.log("Sending message to setNavigatedByExtensionFlag");
                        }
                        sendMessageToBackground({
                            action: "setNavigatedByExtensionFlag",
                            flag: true
                        });

                        if (DEBUG) {
                            console.log("Sending message to setInjectedFlag");
                        }
                        sendMessageToBackground({
                            action: "setInjectedFlag",
                            flag: false
                        });

                        const jobTitleElements = document.querySelectorAll('div.display-flex.flex-wrap.align-items-center.full-height');
                        const companyElementIndex = Array.from(jobTitleElements).indexOf(companyLink.closest('div.display-flex.flex-wrap.align-items-center.full-height')) + 3; 
                        const jobTitleElement = jobTitleElements[companyElementIndex];
                        const personjobTitle = jobTitleElement ? jobTitleElement.querySelector('span[aria-hidden="true"]').innerText.trim() : "Unknown Title";
                        if (DEBUG) {
                            console.log('Extracted Job Title:', personjobTitle);
                        }

                        chrome.storage.local.set({
                            profileUrl: window.location.href,
                            personName: personName,
                            personjobTitle: personjobTitle,
                            companyLink: companyLink.href
                        }, () => {
                            if (DEBUG) {
                                console.log('Profile details saved to storage temporarily. Navigating to company jobs page.');
                            }
                            randomPause(() => {
                                window.location.href = `${companyLink.href}/jobs`;
                            });
                        });
                    }
                });
            }, 1000); 
        } else {
            if (DEBUG) {
                console.log("No company link found on profile page.");
            }
            sendMessageToBackground({
                action: "closeCurrentTab"
            });
        }
    }, 0); 
}

function waitForElement(selector, callback, index = null, timeout = 3000) {

    if (index !== null) {
        if (DEBUG) {
            console.log(`Received index number: ${index}`);
        }
    } else {

    }

    const interval = setInterval(() => {
        const elements = document.querySelectorAll(selector);

        if (index !== null && elements.length > index) {
            if (DEBUG) {
                console.log(`Element at index ${index} found: ${selector}, href: ${elements[index].href}`);
            }
            clearInterval(interval);
            clearTimeout(failSafeTimeout);
            callback(elements[index]);
        } else if (index === null && elements.length > 0) {

            clearInterval(interval);
            clearTimeout(failSafeTimeout);
            callback(Array.from(elements));
        } else {

        }
    }, 1000);

    const failSafeTimeout = setTimeout(() => {

        clearInterval(interval);
        callback(null); 
    }, timeout);
}

function handleCompanyPage() {
    chrome.storage.local.get(['profileUrl', 'personName', 'personjobTitle', 'jobTitleSetByUser', 'recentlyCheckedCompanies', 'knownEmployees'], (data) => {
        if (DEBUG) {
            console.log(`Searching for job title: ${data.jobTitleSetByUser}`);
        }
        if (DEBUG) {
            console.log(`Retrieved from temporary storage-- profileURL: ${data.profileUrl}, ${data.personName}, ${data.personjobTitle}`);
        }

        const now = new Date().getTime();
        const companyNameElement = document.querySelector('.ember-view.org-top-card-summary__title');
        const companyName = companyNameElement ? companyNameElement.innerText.trim() : "Unknown Company";
        const knownEmployees = data.knownEmployees
        if (DEBUG) {
            console.log("Company name extracted:", companyName);
        }
        if (!Array.isArray(knownEmployees)) {
            if (DEBUG) {
                console.error('knownEmployees is not an array:', data.knownEmployees);
            }
        } else {
            if (DEBUG) {
                console.log('knownEmployees is an array:', data.knownEmployees);
            }
        };

        if (data.knownEmployees && data.profileUrl) {
            let employeeExists = false;

            knownEmployees.forEach(employee => {
                if (employee.personURL === data.profileUrl) {
                    employeeExists = true;
                    employee.companyName = companyName;
                    employee.lastSeen = new Date().toISOString(); 
                    if (DEBUG) {
                        console.log(`Updated company name for ${employee.personName} to ${companyName} in storage.`);
                    }
                }
            });

            if (!employeeExists) {
                knownEmployees.push({
                    personName: data.personName,
                    personURL: data.profileUrl,
                    companyName: companyName,
                    discoveredAt: new Date().toISOString(),
                    lastSeen: new Date().toISOString() 
                });
                if (DEBUG) {
                    console.log('Added new employee:', data.personName);
                }
            }

            chrome.storage.local.set({
                knownEmployees
            }, () => {
                if (!Array.isArray(knownEmployees)) {
                    if (DEBUG) {
                        console.error('New details stored, but knownEmployees is not an array:', data.knownEmployees);
                    }
                } else {
                    if (DEBUG) {
                        console.log('New details stored, knownEmployees is an array:', data.knownEmployees);
                    }
                };
            });
        } else {
            if (DEBUG) {
                console.log("Didn't update company name for existing employee");
            }
        }
        extractJobFromCompanyPage();

    });
}

function extractJobFromCompanyPage() {
    waitForElement('.job-card-square__title', jobCards => {
        if (!jobCards) {
            if (DEBUG) {
                console.log("No job elements found on the company's jobs page. Closing tab.");
            }
            sendMessageToBackground({
                action: "closeCurrentTab"
            });
        } else {
            if (DEBUG) {
                console.log('waitForElement returned:', jobCards);
            }
            scrollToElement('.job-card-square__title');
            if (!jobCards.length) {
                if (DEBUG) {
                    console.log("No job elements found on the company's jobs page. Closing tab.");
                }
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
                        if (DEBUG) {
                            console.log('Comparing against job title', jobTitlesUser);
                        }
                        const isJobFound = jobTitlesUser.some(userTitle => jobTitleText.includes(userTitle));
                        const companyNameElement = document.querySelector('.ember-view.org-top-card-summary__title');
                        const companyName = companyNameElement ? companyNameElement.innerText.trim() : "Unknown Company";
                        if (DEBUG) {
                            console.log('Checking job:', jobTitleText, 'in', jobLocation);
                        }

                        const updatedCompanies = data.recentlyCheckedCompanies || [];
                        updatedCompanies.push({
                            name: companyName,
                            timestamp: Date.now()
                        }); 
                        chrome.storage.local.set({
                            'recentlyCheckedCompanies': updatedCompanies
                        }, () => {
                            if (DEBUG) {
                                console.log('Current companies before update:', updatedCompanies);
                            }
                            if (DEBUG) {
                                console.log(`Updated recently checked companies with ${companyName} at ${new Date(Date.now()).toLocaleString()}.`);
                            }
                        });

                        if (isJobFound) {
                            if (DEBUG) {
                                console.log(`Found matching job: ${jobTitleText}, located in ${jobLocation} - URL: ${jobUrl}`);
                            }

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
            behavior: 'smooth', 
            block: 'center', 
            inline: 'nearest' 
        });
        if (DEBUG) {
            console.log(`Scrolled smoothly to the element with selector: ${selector}`);
        }
    } else {
        if (DEBUG) {
            console.log(`Element with selector ${selector} not found.`);
        }
    }
}

function extractCompanyNameFromSearchPage(index) {

    const summaryElements = document.querySelectorAll('.entity-result__summary');
    if (DEBUG) {
        console.log(`Total summary elements found: ${summaryElements.length}`);
    }

    if (index >= 0 && index < summaryElements.length) {

        const strongTag = summaryElements[index].querySelector('strong');
        const companyName = strongTag ? strongTag.innerText.trim() : null;

        return companyName;
    }

    if (DEBUG) {
        console.log(`Headline for index ${index} not found.`);
    }
    return null;
}

function scanProfileElementsAndStore(callback) {

    window.scroll({
        top: document.body.scrollHeight,
        left: 0,
        behavior: 'smooth'
    });

    setTimeout(() => {

        window.scroll({
            top: 0,
            left: 0,
            behavior: 'smooth'
        });

        setTimeout(() => {

            chrome.storage.local.get('knownEmployees', function(storageResult) {
                const knownEmployees = storageResult.knownEmployees || [];
                const updateEmployees = {};
                const toSend = [];
                const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

                if (DEBUG) {
                    console.log(`Fetched ${Object.keys(knownEmployees).length} known profiles from storage.`);
                }

                const allProfileLinks = Array.from(document.querySelectorAll('.entity-result__title-text a.app-aware-link'))
                    .map(link => link.href.split('?')[0].replace(/\/$/, '')) 
                    .filter(link => link.includes('/in/'));

                if (DEBUG) {
                    console.log(`Parsed ${allProfileLinks.length} profile links from the page.`);
                }
                if (DEBUG) {
                    console.log('Profile Links:', allProfileLinks);
                } 

                let matchCount = 0;
                allProfileLinks.forEach(normalizedUrl => {
                    let found = false;
                    for (const key in knownEmployees) {
                        if (knownEmployees.hasOwnProperty(key)) {
                            const employee = knownEmployees[key];
                            const storedUrl = employee.personURL;
                            if (storedUrl) { 
                                const normalizedStoredUrl = storedUrl.replace(/\/$/, ''); 
                                if (normalizedStoredUrl === normalizedUrl) {
                                    const currentDateTime = new Date().toISOString();

                                    if (employee.lastSeen || new Date(employee.discoveredAt) >= oneWeekAgo) {
                                        employee.lastSeen = currentDateTime; 
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
                        toSend.push(normalizedUrl); 
                    }
                });
                if (DEBUG) {
                    console.log(`Found ${matchCount} matches between parsed links and known employees.`);
                }

                if (toSend.length > 0) {
                    const message = {
                        action: "storeProfileLinks",
                        profileLinks: toSend
                    };

                    if (DEBUG) {
                        console.log("Sending to background:", message);
                    }

                    chrome.runtime.sendMessage(message, function(response) {
                        if (response && response.status === "Profile links stored successfully") {
                            if (typeof callback === "function") {
                                callback(); 
                            }
                        } else {
                            if (DEBUG) {
                                console.error("Failed to store profile links:", response.error);
                            }
                        }
                    });
                } else {
                    if (DEBUG) {
                        console.log("No new profiles to store or update needed.");
                    }
                    if (typeof callback === "function") {
                        callback(); 
                    }
                }
            });
        }, 2000); 
    }, 2000); 
}

function openNextProfile(index, retryCount = 0) {
    const maxRetryCount = 2; 
    if (index == null || isNaN(index)) {
        if (DEBUG) {
            console.error("Invalid tab ID or index:", index);
        }
        return;
    }

    chrome.runtime.sendMessage({
        action: "getStoredProfileLinks"
    }, function(response) {
        if (response && response.profileLinks && response.profileLinks.length > 0) {
            const profileLinks = response.profileLinks;
            chrome.storage.local.get('recentlyCheckedCompanies', (data) => {
                const recentlyCheckedCompanies = data.recentlyCheckedCompanies || [];
                if (DEBUG) {
                    console.log("Current index retrieved:", index);
                }

                if (index >= 0 && index < profileLinks.length) {
                    const profileLink = profileLinks[index];
                    const selector = `.entity-result__title-text a[href^='${profileLink}']`;
                    if (DEBUG) {
                        console.log(`Scrolling to element with selector: ${selector}`);
                    }
                    scrollToElement(selector);

                    setTimeout(() => {
                        const headlineElement = document.querySelectorAll('.entity-result__primary-subtitle')[index].innerText.trim();
                        const companyNameInHeadline = headlineElement ? extractCompanyNameFromSearchPage(index) : null;

                        if (companyNameInHeadline && recentlyCheckedCompanies.some(detail => detail.name === companyNameInHeadline)) {
                            if (DEBUG) {
                                console.log(`Skipping profile at index ${index} for known company: ${companyNameInHeadline}`);
                            }
                            incrementIndexAndContinue(index);
                        } else {
                            if (DEBUG) {
                                console.log(`Opening profile URL at index ${index}: ${profileLink}`);
                            }
                            randomPause(() => {
                                sendMessageToBackground({
                                    action: "openNewTab",
                                    url: profileLink
                                });
                            });
                        }
                    }, 1000);
                } else {
                    if (retryCount < maxRetryCount) {
                        if (DEBUG) {
                            console.log("No profile link found at index, retrying...", retryCount + 1);
                        }
                        openNextProfile(index, retryCount + 1); 
                    } else {
                        sendMessageToBackground({
                            action: "clearProfileLinks"
                        })
                        if (DEBUG) {
                            console.log('Clear profile links action sent to background.js', response.status);
                        }
                        clickNextPage();
                    }
                }
            });
        } else {
            if (DEBUG) {
                console.log("Profile links not yet scanned or the response from background is incorrect.");
            }
            if (retryCount < maxRetryCount) {
                if (DEBUG) {
                    console.log("Retrying scan of profile elements...");
                }
                scanProfileElementsAndStore(() => openNextProfile(index, retryCount + 1));
            } else {
                if (DEBUG) {
                    console.log("Max retries reached after scanning. Navigating to next page.");
                }
                clickNextPage();

            }
        }
    });
}

function incrementIndexAndContinue(currentIndex) {
    const nextIndex = currentIndex + 1;

    chrome.runtime.sendMessage({
        action: "updateIndex",
        newIndex: nextIndex
    }, response => {
        if (response && response.status === 'Index updated') {
            if (DEBUG) {
                console.log(`Index incremented to ${nextIndex}, continuing to next profile.`);
            }
            openNextProfile(response.newIndex); 
        } else {
            if (DEBUG) {
                console.error("Failed to update index via background script.");
            }
        }
    });
}

function clickNextPage() {
    if (DEBUG) {
        console.log("Attempting to click the next page button...");
    }

    window.scrollTo(0, document.body.scrollHeight);
    if (DEBUG) {
        console.log(`Scrolling to pagination selector bottom of page.`);
    }

    setTimeout(() => {

        const pageButtons = document.querySelectorAll('ul.artdeco-pagination__pages > li > button');
        if (DEBUG) {
            console.log(`Page buttons found: ${pageButtons.length}`);
        }

        const currentPageButton = Array.from(pageButtons).find(button => button.getAttribute('aria-current') === 'true');

        if (currentPageButton) {
            if (DEBUG) {
                console.log(`Current page button found: ${currentPageButton.innerText}`);
            }

            setTimeout(() => {

                const refreshedPageButtons = document.querySelectorAll('ul.artdeco-pagination__pages > li > button');
                if (DEBUG) {
                    console.log(`Refreshed page buttons found: ${refreshedPageButtons.length}`);
                }

                const refreshedCurrentPageButton = Array.from(refreshedPageButtons).find(button => button.getAttribute('aria-current') === 'true');
                const nextPageIndex = Array.from(refreshedPageButtons).indexOf(refreshedCurrentPageButton) + 1;
                const nextPageButton = refreshedPageButtons[nextPageIndex];

                if (nextPageButton && !nextPageButton.disabled) {

                    const nextPageNumber = nextPageButton.getAttribute('aria-label').match(/\d+/)[0];
                    if (DEBUG) {
                        console.log(`Next page button found: ${nextPageNumber}`);
                    }
                    sendMessageToBackground({
                        action: "setPageNavigatedByExtensionFlag",
                        flag: true
                    });
                    chrome.runtime.sendMessage({
                        action: "updateIndex",
                        newIndex: 0 
                    }, response => {
                        if (response && response.status === 'Index updated') {
                            index = response.newIndex;
                            if (DEBUG) {
                                console.log(`Index updated to ${index}, navigating to next page:`, nextPageNumber);
                            }

                            nextPageButton.click();
                            if (DEBUG) {
                                console.log(`Clicked to navigate to page number: ${nextPageNumber}`);
                            }
                        } else {
                            if (DEBUG) {
                                console.log('Failed to update index, navigation postponed.');
                            }
                        }
                    });

                } else {
                    if (DEBUG) {
                        console.log('No next page button available or it is disabled.');
                    }
                }
            }, 2000); 
        } else {
            if (DEBUG) {
                console.log('Current page button not found.');
            }
        }
    }, 2000); 
}

if (currentURL.includes('/search/results/')) {

    chrome.runtime.sendMessage({
        action: "getCurrentIndex"
    }, (response) => {
        if (response && response.currentIndex != null) {
            if (DEBUG) {
                console.log("It's a search page. Retrieved current index:", response.currentIndex);
            }
            openNextProfile(response.currentIndex);
        } else {
            if (DEBUG) {
                console.error("Failed to retrieve current index or response is undefined.");
            }
        }
    });
} else if (currentURL.includes('/in/')) {
    handleProfilePage();
    if (DEBUG) {
        console.log("It's a profile page. Initiating handleProfilePage");
    }
} else if (currentURL.includes('/company/')) {
    handleCompanyPage();
    if (DEBUG) {
        console.log("It's a company page. Initiating handleCompanyPage");
    }
} else if (currentURL.includes('/school/')) {
    handleCompanyPage(); 
    if (DEBUG) {
        console.log("It's a school page. Initiating handleCompanyPage");
    }
} else {
    if (DEBUG) {
        console.log("URL doesn't match expected patterns.");
    }
}
