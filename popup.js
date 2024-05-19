var DEBUG = false;

document.addEventListener('DOMContentLoaded', () => {
    if (DEBUG) {
        ("Popup DOM loaded and parsed.");
    }
    initializePopup();
    attachEventListeners();
});

function initializePopup() {
    requestjobdetails()
    updateJobTitleDisplay();
    updateMaxProfilesButtonState();
    updateJobTitleButtonState();
    clearJobTitleInput();
    updateLoadButton();
    updateJobListingButtonsState();
    loadMaxNumberOfTabsDisplay();
    updateJobsCount();
    updateLoadButtonWarning();

}

function attachEventListeners() {
    document.getElementById('confirmJobTitleButton').addEventListener('click', saveJobTitle);
    document.getElementById('clearJobTitleButton').addEventListener('click', clearJobTitle);
    document.getElementById('saveMaxNoOfProfiles').addEventListener('click', saveMaxProfiles);
    document.getElementById('clearMaxNoOfProfiles').addEventListener('click', clearMaxProfiles);
    document.getElementById('loadButton').addEventListener('click', launchScript);
    document.getElementById('stopButton').addEventListener('click', stopScript);
    document.getElementById('downloadCsvButton').addEventListener('click', downloadCsv);
    document.getElementById('clearButton').addEventListener('click', clearJobDetails);
    document.getElementById('jobTitleInput').addEventListener('input', jobTitleInputReset);
    document.getElementById('maxProfilesInput').addEventListener('input', maxProfileInputReset);

}

const profilesCountElement = document.getElementById('openedProfilesCount');
const loadButton = document.getElementById('loadButton');
const clearButton = document.getElementById('clearButton');
const jobListingsContainer = document.getElementById('jobListingsContainer');

function requestjobdetails() {
    chrome.runtime.sendMessage({
        action: "requestJobDetails"
    }, (response) => {
        if (DEBUG) {('Received response for job details request:', JSON.stringify(response));}
        if (response && response.status === "Job details sent" && response.jobDetails.length > 0) {
            if (!jobListingsContainer) {
                if (DEBUG) {
                    console.error('jobListingsContainer element not found in the popup.');
                }
                return;
            }

            jobListingsContainer.innerHTML = '';
            response.jobDetails.forEach(jobDetail => {
                const jobListingElement = createJobListing(jobDetail);
                jobListingsContainer.appendChild(jobListingElement);
            });
        } else {
            if (DEBUG) {
                ('No job details received or job details array is empty:', response.status);
            }
        }
    });
}

function loadMaxNumberOfTabsDisplay() {
    chrome.storage.local.get(['maxNumberOfTabs', 'tabOpeningRecords'], function(data) {
        if (DEBUG) {
            ("Data retrieved from storage:", data);
        }
        const maxTabsInput = document.getElementById('openedProfilesCount');
        if (data.maxNumberOfTabs) {
            maxTabsInput.value = data.maxNumberOfTabs;
            if (DEBUG) {
                ("Max number of tabs set in input:", data.maxNumberOfTabs);
            }
        } else {
            if (DEBUG) {
                ("No max number of tabs found in storage.");
            }
        }

        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const profilesOpenedLast24Hours = (data.tabOpeningRecords || []).filter(record => record.time > oneDayAgo).length;
        maxNumberOfTabs = data.maxNumberOfTabs
        if (DEBUG) {
            ("Opened in the last 24 hours:", profilesOpenedLast24Hours);
        }

        if (maxNumberOfTabs) {
            profilesCountElement.textContent = `Currently set to ${maxNumberOfTabs}/day. ${profilesOpenedLast24Hours} profile visits in the last 24 hours.`;
            if (DEBUG) {
                ("Max number of tabs set in input:", maxNumberOfTabs);
            }
        } else {
            profilesCountElement.textContent = `Currently not set. ${profilesOpenedLast24Hours} profile visits in the last 24h.`;
            if (DEBUG) {
                ("No max number of tabs found in storage.");
            }
        }
    });
}

function resetMaxTabsInput() {
    const maxTabsInput = document.getElementById('maxProfilesInput');
    maxTabsInput.value = ''; 
    if (DEBUG) {
        ('maxTabsInput has been reset.');
    }
}

function saveMaxProfiles() {
    const maxProfilesInput = document.getElementById('maxProfilesInput'); 
    const maxNumberOfTabs = parseInt(maxProfilesInput.value, 10); 

    if (isNaN(maxNumberOfTabs)) {
        console.error('Invalid input for maximum number of profiles.'); 
        return; 
    } else {
        chrome.storage.local.set({
            maxNumberOfTabs: maxNumberOfTabs
        }, () => {
            if (DEBUG) {
                ('Set max number of profiles to', maxNumberOfTabs);
            }
        });

        updateMaxProfilesButtonState();
        loadMaxNumberOfTabsDisplay();
        resetMaxTabsInput()
        updateLoadButtonWarning();
        updateLoadButton();
    }
}

function updateLoadButtonWarning() {
    const loadButtonWarning = document.getElementById('loadbuttonwarning');
    const loadButton = document.getElementById('loadButton');

    chrome.storage.local.get(['maxNumberOfTabs', 'tabOpeningRecords'], (data) => {
        const maxTabsAllowed = data.maxNumberOfTabs;
        const openedTabsCount = (data.tabOpeningRecords || []).filter(record => {
            return Date.now() - new Date(record.time).getTime() < 86400000; 
        }).length;

        if (maxTabsAllowed !== undefined && openedTabsCount >= maxTabsAllowed) {
            loadButton.disabled = true;
            loadButtonWarning.textContent = `${openedTabsCount}/${maxTabsAllowed} profiles opened in the past 24 hours. Increase limit to continue.`;
            loadButtonWarning.style.color = 'red';
        } else {

            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                if (tabs.length > 0) {
                    const currentUrl = tabs[0].url;

                    if (!currentUrl.includes("/search/results/")) {
                        loadButtonWarning.textContent = "Must be on a /search/results page, navigate to someone's Connections page.";
                        loadButtonWarning.style.color = 'red'; 
                    } else {
                        loadButtonWarning.textContent = "Ready for launch! 'Load' will open one profile at a time and look for jobs at their most recent company. It will pause up to 8 seconds between steps.";
                        loadButtonWarning.style.color = 'black'; 
                        loadButton.disabled = false; 
                    }
                } else {

                    loadButtonWarning.textContent = "Error: Cannot determine the current page URL.";
                    loadButtonWarning.style.color = 'red'; 
                }
            });
        }
    });
}

function clearMaxProfiles() {
    chrome.storage.local.remove(['maxNumberOfTabs'], function() {
        if (DEBUG) {
            ('Maximum number of tabs and tab opening records cleared.');
        }
        updateMaxProfilesButtonState();
        resetMaxTabsInput()
        loadMaxNumberOfTabsDisplay();

    });
}

function updateMaxProfilesButtonState() {
    const setMaxProfilesSaveButton = document.getElementById('saveMaxNoOfProfiles');
    const setMaxProfilesClearButton = document.getElementById('clearMaxNoOfProfiles');
    chrome.storage.local.get('maxNumberOfTabs', (data) => {
        if (data.maxNumberOfTabs) {
            setMaxProfilesSaveButton.disabled = true;
            setMaxProfilesClearButton.disabled = false;
            if (DEBUG) {
                ('Set Max Profiles button disabled and Clear Max Profiles button enabled.');
            }
        } else {
            setMaxProfilesSaveButton.disabled = false;
            setMaxProfilesClearButton.disabled = true;
            if (DEBUG) {
                ('Set Max Profiles button enabled and Clear Max Profiles button disabled.');
            }
        }
    });
}

function launchScript() {
    if (DEBUG) {
        ('Load button clicked.');
    }

    chrome.storage.local.get(['jobTitleSetByUser', 'maxNumberOfTabs'], (data) => {
        const jobTitleSet = data.jobTitleSetByUser;
        const maxTabsSet = data.maxNumberOfTabs;

        if (!jobTitleSet || !maxTabsSet) {
            if (DEBUG) {
                ('Missing job title or max number of tabs.');
            }

            if (!jobTitleSet) {
                const jobTitleButton = document.getElementById('confirmJobTitleButton');
                jobTitleButton.classList.add('button-highlight');
                setTimeout(() => {
                    jobTitleButton.classList.remove('button-highlight');

                    void jobTitleButton.offsetWidth;
                    jobTitleButton.classList.add('button-highlight');
                }, 200);
            }
            if (!maxTabsSet) {
                const maxVisitsButton = document.getElementById('saveMaxNoOfProfiles');
                maxVisitsButton.classList.add('button-highlight');
                setTimeout(() => {
                    maxVisitsButton.classList.remove('button-highlight');

                    void maxVisitsButton.offsetWidth;
                    maxVisitsButton.classList.add('button-highlight');
                }, 200);
            }
            return;
        }

        document.getElementById('loadButton').disabled = true;
        document.getElementById('stopButton').disabled = false;
        document.getElementById('stopButton').textContent = "Stop";

        chrome.windows.getCurrent({}, (window) => {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                if (tabs.length > 0) {
                    const currentTab = tabs[0];
                    if (DEBUG) {
                        ('Active tab ID:', currentTab.id, 'in window ID:', window.id, 'URL:', currentTab.url);
                    }
                    if (currentTab.url && currentTab.url.includes("/search/results/")) {
                        chrome.runtime.sendMessage({
                            action: "loadContentScript",
                            tabId: currentTab.id,
                            windowId: window.id 
                        }, response => {
                            if (chrome.runtime.lastError) {
                                console.error('Error sending loadContentScript message:', chrome.runtime.lastError.message);
                            } else {
                                if (DEBUG) {
                                    ('Load button action sent to background.js', response);
                                }
                            }
                        });
                    } else {
                        if (DEBUG) {
                            ('Not on the correct LinkedIn search results page.');
                        }
                    }
                } else {
                    if (DEBUG) {
                        ('No active tab found.');
                    }
                }
            });
        });
    });
}

function updateLoadButton() {
    chrome.tabs.query({
        active: true,
        currentWindow: true
    }, (tabs) => {
        if (tabs.length > 0 && tabs[0].url.includes("linkedin.com/search/results/")) {
            const loadButton = document.getElementById('loadButton');
            const stopButton = document.getElementById('stopButton');
            if (loadButton) {
                loadButton.disabled = false;
                stopButton.disabled = false;
                if (DEBUG) {
                    ("Load button has been enabled.");
                }
            }
        } else {
            const loadButton = document.getElementById('loadButton');
            if (loadButton) {
                loadButton.disabled = true;
                stopButton.disabled = false;
                if (DEBUG) {
                    ("Load button has been disabled as the tab is not on the correct LinkedIn search results page.");
                }
            }
        }
    });
}

function jobTitleInputReset() {
    if (jobTitleInput.value.trim()) {
        confirmJobTitleButton.disabled = false; 
    } else {
        confirmJobTitleButton.disabled = true; 
    }
}

function maxProfileInputReset() {
    if (maxProfilesInput.value.trim()) {
        saveMaxNoOfProfiles.disabled = false; 
    } else {
        saveMaxNoOfProfiles.disabled = true;
    }
}

function clearJobDetails() {
    if (DEBUG) {
        ('Clicked Clear Button');
    }
    jobListingsContainer.innerHTML = '';
    chrome.runtime.sendMessage({
        action: "clearJobDetails"
    }, (response) => {
        if (DEBUG) {
            ('Cleared job details, response:', response);
        }
        updateJobsCount();
    });
}

function stopScript() {
    chrome.tabs.query({
        active: true,
        currentWindow: true
    }, (tabs) => {
        if (tabs.length > 0) {
            if (DEBUG) {
                ('Clicked Stop Button on Tab ID:', tabs[0].id);
            }
            chrome.runtime.sendMessage({
                action: "stopScript",
                tabId: tabs[0].id
            }, (response) => {
                if (DEBUG) {
                    ("Stop script message sent for Tab ID:", tabs[0].id, response);
                }
                const stopButton = document.getElementById('stopButton');
                const loadButton = document.getElementById('loadButton'); 
                if (stopButton) {
                    stopButton.textContent = "Stopping...";
                    stopButton.disabled = true;
                    if (DEBUG) {
                        ("Stop button disabled and text changed to 'Stopping...'");
                    }
                }
                if (loadButton) {
                    loadButton.disabled = true;
                    if (DEBUG) {
                        ("Load button re-enabled.");
                    }
                }

            });
        } else {
            console.error("No active tab detected.");
        }
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "operationHalted") {
        if (DEBUG) {
            (message.message);
        }
        stopButton = document.getElementById('stopButton');
        stopButton.disabled = true;
        stopButton.textContent = "Stopped"
        document.getElementById('loadButton').disabled = false;

    }
});

function updateJobsCount() {
    chrome.storage.local.get('jobDetails', function(data) {
        const jobsCount = data.jobDetails ? data.jobDetails.length : 0; 
        const jobsFoundSpan = document.getElementById('jobsFoundCount');
        if (jobsFoundSpan) {
            jobsFoundSpan.textContent = `Jobs found: ${jobsCount}`; 
        } else {
            if (DEBUG) {
                ('jobsFoundCount span not found in the DOM.');
            }
        }
    });
}

function saveJobTitle() {
    if (DEBUG) {
        ("Confirm Job Title button clicked.");
    }
    const jobTitleInput = document.getElementById('jobTitleInput');
    const jobTitle = jobTitleInput.value.trim();
    if (jobTitle) {
        if (DEBUG) {
            (`Attempting to set job title: ${jobTitle}`);
        }
        chrome.storage.local.set({
            'jobTitleSetByUser': jobTitle
        }, () => {
            if (DEBUG) {
                (`Job title set to: ${jobTitle}`);
            }
            updateJobTitleButtonState();
            updateJobTitleDisplay();
            clearJobTitleInput();
        });
    } else {
        if (DEBUG) {
            ("No job title entered. Attempting to clear any existing job title from storage.");
        }
        chrome.storage.local.remove('jobTitleSetByUser', () => {
            if (DEBUG) {
                ('Job title cleared from storage because the input was empty.');
            }
            updateJobTitleButton();
            updateJobTitleDisplay();
            clearJobTitleInput();
        });
    }
}

function handleJobTitleTextBox() {
    if (DEBUG) {
        ("handleJobTitleTextBox called");
    }
    const jobTitleInput = document.getElementById('jobTitleInput');
    const jobTitle = jobTitleInput.value.trim(); 
    if (jobTitle !== '') {

        if (DEBUG) {("Job title input updated, awaiting confirmation.");}
    } else {

        if (DEBUG) {
            ("Input is empty, awaiting further input or action.");
        }
    }
}

function clearJobTitle() {
    if (DEBUG) {
        ("Clear button clicked. Attempting to clear job title.");
    }
    chrome.storage.local.remove('jobTitleSetByUser', () => {
        updateJobTitleDisplay(); 
        updateJobTitleButtonState();
        clearJobTitleInput();
        if (DEBUG) {
            ('Job title cleared. Load button is now disabled.');
        }
    });
}

function clearJobTitleInput() {
    const jobTitleInput = document.getElementById('jobTitleInput');
    if (DEBUG) {
        ('Trying to clear from job title text box:', jobTitleInput.value);
    }
    jobTitleInput.value = ''; 
    if (DEBUG) {
        ('After clearing:', jobTitleInput.value);
    }
}

function updateJobTitleButtonState() {
    chrome.storage.local.get('jobTitleSetByUser', (data) => {
        if (data.jobTitleSetByUser) {

            document.getElementById('confirmJobTitleButton').disabled = true;
            document.getElementById('clearJobTitleButton').disabled = false;
            document.getElementById('currentJobTitle').textContent = `Current job title(s): ${data.jobTitleSetByUser}`;
            if (DEBUG) {
                (`Job title: ${data.jobTitleSetByUser}`);
            }
        } else {

            document.getElementById('confirmJobTitleButton').disabled = false;
            document.getElementById('clearJobTitleButton').disabled = true;
            document.getElementById('currentJobTitle').textContent = "Current search term: None";
            if (DEBUG) {
                ("No job title set.");
            }
        }
    });
}

function updateJobTitleDisplay() {
    chrome.storage.local.get('jobTitleSetByUser', (data) => {
        const displayElement = document.getElementById('currentJobTitle');
        if (data.jobTitleSetByUser) {
            displayElement.textContent = `Currently set to: ${data.jobTitleSetByUser}`;
        } else {
            displayElement.textContent = "Currently set to: None";
        }
    });
}

function updateJobListingButtonsState() {
    chrome.storage.local.get('jobDetails', (data) => {
        const downloadCsvButton = document.getElementById('downloadCsvButton');
        const clearButton = document.getElementById('clearButton');
        if (data.jobDetails && data.jobDetails.length > 0) {
            downloadCsvButton.disabled = false;
            clearButton.disabled = false;
            if (DEBUG) {
                ("Buttons have been enabled.");
            }
        } else {
            downloadCsvButton.disabled = true;
            clearButton.disabled = true;
            if (DEBUG) {
                ("Buttons have been disabled as there are no job listings.");
            }
        }
    });
}

function downloadCsv() {
    chrome.storage.local.get('jobDetails', (data) => {
        if (data.jobDetails && data.jobDetails.length > 0) {
            const csvContent = convertToCSV(data.jobDetails);
            triggerDownload(csvContent, 'job_details.csv');
        } else {
            if (DEBUG) {
                ('No job details available to download.');
            }
        }
    });
}

const createJobListing = (jobDetail) => {
    const jobListingElement = document.createElement('div');
    jobListingElement.className = 'job-listing';

    const headerContainer = document.createElement('div');
    headerContainer.className = 'job-listing-header';

    const joblistingsheaderjobtitle = document.createElement('div');
    joblistingsheaderjobtitle.className = 'job-listings-header-job-title';

    const headerEmoji = document.createElement('img');
    headerEmoji.className = 'emoji-container';
    headerEmoji.src = 'images/job.svg';
    headerEmoji.alt = 'Job';
    headerEmoji.width = '15'; 
    headerEmoji.height = '15';
    joblistingsheaderjobtitle.appendChild(headerEmoji);

    const jobTitleContainer = document.createElement('div');
    jobTitleContainer.className = 'jobtitle';
    const jobTitleLink = document.createElement('a'); 
    jobTitleLink.textContent = jobDetail.jobTitleText;
    jobTitleLink.href = jobDetail.jobUrl;
    jobTitleLink.target = '_blank';
    jobTitleContainer.appendChild(jobTitleLink);
    joblistingsheaderjobtitle.appendChild(jobTitleContainer);

    headerContainer.appendChild(joblistingsheaderjobtitle);

    const openAllElement = document.createElement('div');
    openAllElement.className = 'open-all-details';
    const openAllLink = document.createElement('button');
    openAllLink.className = 'openallbutton';
    openAllLink.textContent = 'Open';
    openAllLink.addEventListener('click', (event) => {
        event.preventDefault();
        if (DEBUG) {
            ('Opening all related links in new tabs');
        }
        chrome.tabs.create({
            url: jobDetail.profileUrl
        });
        chrome.tabs.create({
            url: jobDetail.jobUrl
        });
    });
    openAllElement.appendChild(openAllLink);
    headerContainer.appendChild(openAllElement);

    jobListingElement.appendChild(headerContainer);

    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'details-container';

    const companyContainer = document.createElement('div');
    companyContainer.className = 'job-listing-detail-element';

    const companyIcon = document.createElement('img');
    companyIcon.className = 'emoji-container';
    companyIcon.src = 'images/company.svg'; 
    companyIcon.alt = 'Company';
    companyIcon.width = '15';
    companyIcon.height = '15'; 

    companyContainer.appendChild(companyIcon);

    const companyLink = document.createElement('a');
    companyLink.textContent = `${jobDetail.companyName}`;
    companyLink.href = jobDetail.companyLink;
    companyLink.target = '_blank';
    companyContainer.appendChild(companyLink);
    detailsContainer.appendChild(companyContainer);

    const locationContainer = document.createElement('div');
    locationContainer.className = 'job-listing-detail-element';

    const locationIcon = document.createElement('img');
    locationIcon.className = 'emoji-container';
    locationIcon.src = 'images/location.svg'; 
    locationIcon.alt = 'Location'; 
    locationIcon.width = '15'; 
    locationIcon.height = '15'; 

    locationContainer.appendChild(locationIcon);

    const locationLink = document.createElement('span');
    locationLink.textContent = jobDetail.jobLocation;
    locationContainer.appendChild(locationLink);
    detailsContainer.appendChild(locationContainer);

    const personJobContainer = document.createElement('div');
    personJobContainer.className = 'job-listing-detail-element';

    const personEmoji = document.createElement('img'); 
    personEmoji.className = 'emoji-container';
    personEmoji.src = 'images/person.svg'; 
    personEmoji.alt = 'Person'; 
    personEmoji.width = '15';
    personEmoji.height = '15';
    personJobContainer.appendChild(personEmoji);

    const personLink = document.createElement('a');
    personLink.textContent = `${jobDetail.personName} (${jobDetail.personjobTitle})`;
    personLink.href = jobDetail.profileUrl;
    personLink.target = '_blank';
    personJobContainer.appendChild(personLink);

    detailsContainer.appendChild(personJobContainer);

    jobListingElement.appendChild(detailsContainer);

    return jobListingElement;
};

function convertToCSV(objArray) {
    const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
    let str = '';

    const columnNames = [
        "Company",
        "Job",
        "Where",
        "Job URL",
        "Contact Name",
        "Contact Position",
        "LinkedIn Profile"
    ];

    str += columnNames.join(",") + '\r\n';

    array.forEach((item) => {
        let line = [
            item.companyName || '',
            item.jobTitleText || '',
            item.jobLocation || '',
            item.jobUrl || '',
            item.personName || '',
            item.personjobTitle || '',
            item.profileUrl || ''
        ].map(field => `"${field.replace(/"/g, '""')}"`); 

        str += line.join(',') + '\r\n';
    });

    return str;
}

function triggerDownload(csvContent, fileName) {
    const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
