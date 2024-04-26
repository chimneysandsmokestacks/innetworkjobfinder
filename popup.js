document.addEventListener('DOMContentLoaded', () => {
    console.log("Popup DOM fully loaded and parsed.");
    initializePopup();
    attachEventListeners();
});

function initializePopup() {
    requestjobdetails()
    updateJobTitleDisplay();
    updateMaxProfilesButtonState();
    updateJobTitleButtonState();
    // loadJobTitle ();
    //  handleJobTitleTextBox();
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
        // console.log('Received response for job details request:', JSON.stringify(response));
        if (response && response.status === "Job details sent" && response.jobDetails.length > 0) {
            if (!jobListingsContainer) {
                console.error('jobListingsContainer element not found in the popup.');
                return;
            }

            jobListingsContainer.innerHTML = '';
            response.jobDetails.forEach(jobDetail => {
                const jobListingElement = createJobListing(jobDetail);
                jobListingsContainer.appendChild(jobListingElement);
            });
        } else {
            console.log('No job details received or job details array is empty:', response.status);
        }
    });
}


function loadMaxNumberOfTabsDisplay() {
    // Load the current max number of tabs on popup open
    chrome.storage.local.get(['maxNumberOfTabs', 'tabOpeningRecords'], function(data) {
        console.log("Data retrieved from storage:", data);
        const maxTabsInput = document.getElementById('openedProfilesCount');
        if (data.maxNumberOfTabs) {
            maxTabsInput.value = data.maxNumberOfTabs;
            console.log("Max number of tabs set in input:", data.maxNumberOfTabs);
        } else {
            console.log("No max number of tabs found in storage.");
        }
        // Calculate and display the number of tabs opened in the last 24 hours
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const profilesOpenedLast24Hours = (data.tabOpeningRecords || []).filter(record => record.time > oneDayAgo).length;
        maxNumberOfTabs = data.maxNumberOfTabs
        console.log("Opened in the last 24 hours:", profilesOpenedLast24Hours);

        if (maxNumberOfTabs) {
            profilesCountElement.textContent = `Currently set to ${maxNumberOfTabs}/day. ${profilesOpenedLast24Hours} profile visits in the last 24 hours.`;
            console.log("Max number of tabs set in input:", maxNumberOfTabs);
        } else {
            profilesCountElement.textContent = `Currently not set. ${profilesOpenedLast24Hours} profile visits in the last 24h.`;
            console.log("No max number of tabs found in storage.");
        }
    });
}


function resetMaxTabsInput() {
    const maxTabsInput = document.getElementById('maxProfilesInput');
    maxTabsInput.value = ''; // Reset the input to empty, or you can set a default value if needed
    console.log('maxTabsInput has been reset.');
}




function saveMaxProfiles() {
    const maxProfilesInput = document.getElementById('maxProfilesInput'); // Get the input element
    const maxNumberOfTabs = parseInt(maxProfilesInput.value, 10); // Correctly access the value of the input and parse it to an integer

    if (isNaN(maxNumberOfTabs)) {
        console.error('Invalid input for maximum number of profiles.'); // Log an error if the input is not a valid number
        return; // Prevent further execution if the number is not valid
    } else {
        chrome.storage.local.set({
            maxNumberOfTabs: maxNumberOfTabs
        }, () => {
            console.log('Set max number of profiles to', maxNumberOfTabs); // Confirm in the console that the value has been set
        });

        updateMaxProfilesButtonState();
        loadMaxNumberOfTabsDisplay();
        resetMaxTabsInput()
    }
}


function updateLoadButtonWarning() {
    const loadButtonWarning = document.getElementById('loadbuttonwarning'); 
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs.length > 0) {
            const currentUrl = tabs[0].url;
            // Check if the URL includes the necessary path for search results
            if (!currentUrl.includes("/search/results/")) {
                loadButtonWarning.textContent = "Must be on a /search/results page.";
                loadButtonWarning.style.color = 'red'; // Optional: set text color to red for warning
            } else {
                loadButtonWarning.textContent = "Ready for launch! 'Load' will open one profile at a time and look for jobs at their most recent company. It will pause up to 8 seconds between steps." ; // Clear warning if on correct page
            }
        } else {
            // Handle case where no active tab is found or there's an error accessing tab URL
            loadButtonWarning.textContent = "Error: Cannot determine the current page URL.";
            loadButtonWarning.style.color = 'red'; // Optional: set text color to red for warning
        }
    });
}


// Clear max number of tabs and tab opening records
function clearMaxProfiles() {
    chrome.storage.local.remove(['maxNumberOfTabs'], function() {
        console.log('Maximum number of tabs and tab opening records cleared.');
        updateMaxProfilesButtonState();
        resetMaxTabsInput()
        loadMaxNumberOfTabsDisplay();
    });
}

// Function to update the Set Max Profiles button state
function updateMaxProfilesButtonState() {
    const setMaxProfilesSaveButton = document.getElementById('saveMaxNoOfProfiles');
    const setMaxProfilesClearButton = document.getElementById('clearMaxNoOfProfiles');
    chrome.storage.local.get('maxNumberOfTabs', (data) => {
        if (data.maxNumberOfTabs) {
            setMaxProfilesSaveButton.disabled = true;
            setMaxProfilesClearButton.disabled = false;
            console.log('Set Max Profiles button disabled and Clear Max Profiles button enabled.');
        } else {
            setMaxProfilesSaveButton.disabled = false;
            setMaxProfilesClearButton.disabled = true;
            console.log('Set Max Profiles button enabled and Clear Max Profiles button disabled.');
        }
    });
}


    function launchScript() {
    console.log('Load button clicked.');

    // First, retrieve the necessary data from storage
    chrome.storage.local.get(['jobTitleSetByUser', 'maxNumberOfTabs'], (data) => {
        const jobTitleSet = data.jobTitleSetByUser;
        const maxTabsSet = data.maxNumberOfTabs;

        // Check if the job title and max number of tabs are set
        if (!jobTitleSet || !maxTabsSet) {
            console.log('Missing job title or max number of tabs.');

            if (!jobTitleSet) {
                const jobTitleButton = document.getElementById('confirmJobTitleButton');
                jobTitleButton.classList.add('button-highlight');
                setTimeout(() => {
                    jobTitleButton.classList.remove('button-highlight');
                    // Force reflow/repaint
                    void jobTitleButton.offsetWidth;
                    jobTitleButton.classList.add('button-highlight');
                }, 200);
            }
            if (!maxTabsSet) {
                const maxVisitsButton = document.getElementById('saveMaxNoOfProfiles');
                maxVisitsButton.classList.add('button-highlight');
                setTimeout(() => {
                    maxVisitsButton.classList.remove('button-highlight');
                    // Force reflow/repaint
                    void maxVisitsButton.offsetWidth;
                    maxVisitsButton.classList.add('button-highlight');
                }, 200);
            }
            return; // Stop further execution since settings are not complete
        }

        // If settings are complete, disable the Load button and enable the Stop button
        document.getElementById('loadButton').disabled = true;
        document.getElementById('stopButton').disabled = false;
        document.getElementById('stopButton').textContent = "Stop";

        // Continue with launching the script
        chrome.windows.getCurrent({}, (window) => {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                if (tabs.length > 0) {
                    const currentTab = tabs[0];
                    console.log('Active tab ID:', currentTab.id, 'in window ID:', window.id, 'URL:', currentTab.url);
                    if (currentTab.url && currentTab.url.includes("/search/results/")) {
                        chrome.runtime.sendMessage({
                            action: "loadContentScript",
                            tabId: currentTab.id,
                            windowId: window.id // Pass the current window ID
                        }, response => {
                            if (chrome.runtime.lastError) {
                                console.error('Error sending loadContentScript message:', chrome.runtime.lastError.message);
                            } else {
                                console.log('Load button action sent to background.js', response);
                            }
                        });
                    } else {
                        console.log('Not on the correct LinkedIn search results page.');
                    }
                } else {
                    console.log('No active tab found.');
                }
            });
        });
    });
}




                function updateLoadButton() {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs.length > 0 && tabs[0].url.includes("linkedin.com/search/results/")) {
                    const loadButton = document.getElementById('loadButton');
                    const stopButton = document.getElementById('stopButton');
                    if (loadButton) {
                        loadButton.disabled = false;
                        stopButton.disabled = false;
                        console.log("Load button has been enabled.");
                    }
                } else {
                    const loadButton = document.getElementById('loadButton');
                    if (loadButton) {
                        loadButton.disabled = true;
                        console.log("Load button has been disabled as the tab is not on the correct LinkedIn search results page.");
                            }
                        }
                    });
                }



            function jobTitleInputReset () {  
                 if (jobTitleInput.value.trim()) {
            confirmJobTitleButton.disabled = false; // Enable the button if input is not empty
        } else {
            confirmJobTitleButton.disabled = true; // Disable the button if input is empty
        }
    }
            function maxProfileInputReset () {  
                 if (maxProfilesInput.value.trim()) {
            saveMaxNoOfProfiles.disabled = false; // Enable the button if input is not empty
        } else {
            saveMaxNoOfProfiles.disabled = true; // Disable the button if input is empty
        }
    }


    

            function clearJobDetails() {
                console.log('Clicked Clear Button');
                jobListingsContainer.innerHTML = '';
                chrome.runtime.sendMessage({
                    action: "clearJobDetails"
                }, (response) => {
                    console.log('Cleared job details, response:', response);
                    updateJobsCount();
                });
            }

            function stopScript() {
                chrome.tabs.query({
                    active: true,
                    currentWindow: true
                }, (tabs) => {
                    if (tabs.length > 0) {
                        console.log('Clicked Stop Button on Tab ID:', tabs[0].id);
                        chrome.runtime.sendMessage({
                            action: "stopScript",
                            tabId: tabs[0].id
                        }, (response) => {
                            console.log("Stop script message sent for Tab ID:", tabs[0].id, response);
                            const stopButton = document.getElementById('stopButton');
                            const loadButton = document.getElementById('loadButton'); // Ensure you have a reference to the Load button
                            if (stopButton) {
                                stopButton.textContent = "Stopping...";
                                stopButton.disabled = true; // Disable the Stop button immediately
                                console.log("Stop button disabled and text changed to 'Stopping...'");
                            }
                            if (loadButton) {
                                loadButton.disabled = true; // Re-enable the Load button
                                console.log("Load button re-enabled.");
                            }

                        });
                    } else {
                        console.error("No active tab detected.");
                    }
                });
            }


            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.action === "operationHalted") {
                    console.log(message.message);
                    stopButton = document.getElementById('stopButton');
                    stopButton.disabled = true;
                    stopButton.textContent = "Stopped"
                    document.getElementById('loadButton').disabled = false;
                    // Log the halt message
                    // You can update the UI or show a notification to the user here

                }
            });



            function updateJobsCount() {
                chrome.storage.local.get('jobDetails', function(data) {
                    const jobsCount = data.jobDetails ? data.jobDetails.length : 0; // Get the length of the jobs list, or 0 if it's undefined
                    const jobsFoundSpan = document.getElementById('jobsFoundCount');
                    if (jobsFoundSpan) {
                        jobsFoundSpan.textContent = `Jobs found: ${jobsCount}`; // Update the text content of the span
                    } else {
                        console.log('jobsFoundCount span not found in the DOM.');
                    }
                });
            }




            function saveJobTitle() {
                console.log("Confirm Job Title button clicked.");
                const jobTitleInput = document.getElementById('jobTitleInput');
                const jobTitle = jobTitleInput.value.trim();
                if (jobTitle) {
                    console.log(`Attempting to set job title: ${jobTitle}`);
                    chrome.storage.local.set({
                        'jobTitleSetByUser': jobTitle
                    }, () => {
                        console.log(`Job title set to: ${jobTitle}`);
                        updateJobTitleButtonState(); // Update button state after setting job title
                        updateJobTitleDisplay();
                        clearJobTitleInput();
                    });
                } else {
                    console.log("No job title entered. Attempting to clear any existing job title from storage.");
                    chrome.storage.local.remove('jobTitleSetByUser', () => {
                        console.log('Job title cleared from storage because the input was empty.');
                        updateJobTitleButton(); // Update button state after clearing job title
                        updateJobTitleDisplay();
                        clearJobTitleInput();
                    });
                }
            }


            function handleJobTitleTextBox() {
                console.log("handleJobTitleTextBox called");
                const jobTitleInput = document.getElementById('jobTitleInput');
                const jobTitle = jobTitleInput.value.trim(); // Access the value of the input and trim whitespace
                if (jobTitle !== '') {

                    // Optionally, handle UI updates or validations
                    // console.log("Job title input updated, awaiting confirmation.");
                } else {

                    // Handle empty input if needed, such as disabling the confirm button
                    console.log("Input is empty, awaiting further input or action.");
                }
            }


            // Clear job title and disable load button
            function clearJobTitle() {
                console.log("Clear button clicked. Attempting to clear job title.");
                chrome.storage.local.remove('jobTitleSetByUser', () => {
                    updateJobTitleDisplay(); // Clear the text box
                    updateJobTitleButtonState();
                    clearJobTitleInput();
                    console.log('Job title cleared. Load button is now disabled.');
                });
            }



            function clearJobTitleInput() {
                const jobTitleInput = document.getElementById('jobTitleInput');
                console.log('Trying to clear from job title text box:', jobTitleInput.value);
                jobTitleInput.value = ''; // Set the value to an empty string
                console.log('After clearing:', jobTitleInput.value);
            }

            function updateJobTitleButtonState() {
                chrome.storage.local.get('jobTitleSetByUser', (data) => {
                    if (data.jobTitleSetByUser) {

                        document.getElementById('confirmJobTitleButton').disabled = true;
                        document.getElementById('clearJobTitleButton').disabled = false;
                        document.getElementById('currentJobTitle').textContent = `Current search term: ${data.jobTitleSetByUser}`;
                        console.log(`Job title: ${data.jobTitleSetByUser}`);
                    } else {

                        document.getElementById('confirmJobTitleButton').disabled = false;
                        document.getElementById('clearJobTitleButton').disabled = true;
                        document.getElementById('currentJobTitle').textContent = "Current search term: None";
                        console.log("No job title set.");
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
                    // Check if there are job details to enable or disable buttons accordingly
                    if (data.jobDetails && data.jobDetails.length > 0) {
                        downloadCsvButton.disabled = false;
                        clearButton.disabled = false;
                        console.log("Buttons have been enabled.");
                    } else {
                        downloadCsvButton.disabled = true;
                        clearButton.disabled = true;
                        console.log("Buttons have been disabled as there are no job listings.");
                    }
                });
            }

            function downloadCsv() {
                chrome.storage.local.get('jobDetails', (data) => {
                    if (data.jobDetails && data.jobDetails.length > 0) {
                        const csvContent = convertToCSV(data.jobDetails);
                        triggerDownload(csvContent, 'job_details.csv');
                    } else {
                        console.log('No job details available to download.');
                    }
                });
            }

                const createJobListing = (jobDetail) => {
                const jobListingElement = document.createElement('div');
                jobListingElement.className = 'job-listing';

                // Header container for Job Title, Open All Link, and Emoji
                const headerContainer = document.createElement('div');
                headerContainer.className = 'job-listing-header';

                // Container that groups SVG and job title on the left
                const joblistingsheaderjobtitle = document.createElement('div');
                joblistingsheaderjobtitle.className = 'job-listings-header-job-title';

                // Replace div with img for the SVG icon
                const headerEmoji = document.createElement('img');
                headerEmoji.className = 'emoji-container';
                headerEmoji.src = 'images/job.svg'; // Path to your SVG file
                headerEmoji.alt = 'Job'; // Accessibility: textual description of the image
                headerEmoji.width = '15'; // Width in pixels
                headerEmoji.height = '15'; // Height in pixels
                joblistingsheaderjobtitle.appendChild(headerEmoji);

                // Job Title for the subcontainer
                const jobTitleContainer = document.createElement('div');
                jobTitleContainer.className = 'jobtitle';
                const jobTitleLink = document.createElement('a'); // Ensure anchor element is used for hyperlinks
                jobTitleLink.textContent = jobDetail.jobTitleText;
                jobTitleLink.href = jobDetail.jobUrl;
                jobTitleLink.target = '_blank';
                jobTitleContainer.appendChild(jobTitleLink);
                joblistingsheaderjobtitle.appendChild(jobTitleContainer);

                // Append to header container
                headerContainer.appendChild(joblistingsheaderjobtitle);


                // Open All Button in the header
                const openAllElement = document.createElement('div');
                openAllElement.className = 'open-all-details';
                const openAllLink = document.createElement('button');
                openAllLink.className = 'openallbutton';
                openAllLink.textContent = 'Open';
                openAllLink.addEventListener('click', (event) => {
                event.preventDefault();
                console.log('Opening all related links in new tabs');
                chrome.tabs.create({
                    url: jobDetail.profileUrl
                });
                chrome.tabs.create({
                    url: jobDetail.jobUrl
                });
                });
                openAllElement.appendChild(openAllLink);
                headerContainer.appendChild(openAllElement);

                // Append the header container to the main job listing element
                jobListingElement.appendChild(headerContainer);

                // Details container for Company, Location, and Person
                const detailsContainer = document.createElement('div');
                detailsContainer.className = 'details-container';

                // Company Name
                const companyContainer = document.createElement('div');
                companyContainer.className = 'job-listing-detail-element';

                // Replace div with img and set appropriate attributes for SVG
                const companyIcon = document.createElement('img');
                companyIcon.className = 'emoji-container';
                companyIcon.src = 'images/company.svg'; // Ensure this is the correct path to your SVG file
                companyIcon.alt = 'Company'; // Accessibility: textual description of the image
                companyIcon.width = '15'; // Width in pixels, adjust as necessary
                companyIcon.height = '15'; // Height in pixels, adjust as necessary

                companyContainer.appendChild(companyIcon);

                const companyLink = document.createElement('a');
                companyLink.textContent = `${jobDetail.companyName}`;
                companyLink.href = jobDetail.companyLink;
                companyLink.target = '_blank';
                companyContainer.appendChild(companyLink);
                detailsContainer.appendChild(companyContainer);


                

                const locationContainer = document.createElement('div');
                locationContainer.className = 'job-listing-detail-element';

                // Replace div with img and set appropriate attributes for SVG
                const locationIcon = document.createElement('img');
                locationIcon.className = 'emoji-container';
                locationIcon.src = 'images/location.svg'; // Path to your SVG file in the images folder
                locationIcon.alt = 'Location'; // Accessibility: textual description of the image
                locationIcon.width = '15'; // Width in pixels, adjust as necessary
                locationIcon.height = '15'; // Height in pixels, adjust as necessary

                locationContainer.appendChild(locationIcon);

                const locationLink = document.createElement('span');
                locationLink.textContent = jobDetail.jobLocation;
                locationContainer.appendChild(locationLink);
                detailsContainer.appendChild(locationContainer);


                // Person and Job Title
                const personJobContainer = document.createElement('div');
                personJobContainer.className = 'job-listing-detail-element';

                // Create a container for the SVG
                const personEmoji = document.createElement('img'); // Change from div to img for direct image handling
                personEmoji.className = 'emoji-container';
                personEmoji.src = 'images/person.svg'; // Path to your SVG file
                personEmoji.alt = 'Person'; // Accessibility: textual description of the image
                personEmoji.width = '15'; // Width in pixels
                personEmoji.height = '15';
                personJobContainer.appendChild(personEmoji);

                // Create the link for the person's name and job title
                const personLink = document.createElement('a'); 
                personLink.textContent = `${jobDetail.personName} (${jobDetail.personjobTitle})`;
                personLink.href = jobDetail.profileUrl;
                personLink.target = '_blank';
                personJobContainer.appendChild(personLink);

                // Append the job container to the main container
                detailsContainer.appendChild(personJobContainer);

                // Append the details container to the main job listing element
                jobListingElement.appendChild(detailsContainer);

                return jobListingElement;
            };



            function convertToCSV(objArray) {
                const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
                let str = '';

                // Define column names in the specified order
                const columnNames = [
                    "Company",
                    "Job Title",
                    "Job Location",
                    "Job URL",
                    "Person Name",
                    "Person Job Title",
                    "Profile URL"
                ];

                // Add column headers to the CSV
                str += columnNames.join(",") + '\r\n';

                // Extract data
                array.forEach((item) => {
                    let line = [
                        item.companyName || '',
                        item.jobTitleText || '',
                        item.jobLocation || '',
                        item.jobUrl || '',
                        item.personName || '',
                        item.personjobTitle || '',
                        item.profileUrl || ''
                    ].map(field => `"${field.replace(/"/g, '""')}"`); // Enclose each field in quotes and escape internal quotes

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
