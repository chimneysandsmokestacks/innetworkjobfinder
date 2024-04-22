document.addEventListener('DOMContentLoaded', () => {
console.log("Popup DOM fully loaded and parsed.");



function initializePopup() {
        chrome.storage.local.get('jobTitleSetByUser', (data) => {
            if (data.jobTitleSetByUser) {
                document.getElementById('jobTitleInput').value = data.jobTitleSetByUser;
                document.getElementById('loadButton').disabled = false;
                document.getElementById('currentJobTitle').textContent = `Currently set to: ${data.jobTitleSetByUser}`;
                console.log(`Popup initialized with job title: ${data.jobTitleSetByUser}`);
            } else {
                document.getElementById('loadButton').disabled = true;
                document.getElementById('currentJobTitle').textContent = "Currently set to: None";
                console.log("Popup initialized without a job title set.");
            }
        });
    }

    // Call initialize function to set up the popup each time it's opened
    initializePopup();


// Function to create a job listing element
const createJobListing = (jobDetail) => {
console.log('Creating job listing with details:', jobDetail);

const jobListingElement = document.createElement('div');
jobListingElement.className = 'job-listing';

// Job Title and Company Name
const jobTitleCompanyElement = document.createElement('div');
jobTitleCompanyElement.className = 'job-listing-section';
const jobLink = document.createElement('a');
jobLink.textContent = `${jobDetail.jobTitleText} at ${jobDetail.companyName} in ${jobDetail.jobLocation} `;
jobLink.href = jobDetail.jobUrl;
jobLink.target = '_blank';
jobTitleCompanyElement.appendChild(jobLink);

// Person and Job Title
const personJobElement = document.createElement('div');
personJobElement.className = 'job-listing-section';
const personLink = document.createElement('a');
personLink.textContent = `${jobDetail.personName} (${jobDetail.personjobTitle})`;
personLink.href = jobDetail.profileUrl;
personLink.target = '_blank';
personJobElement.appendChild(personLink);

// Open All Link
const openAllElement = document.createElement('div');
openAllElement.className = 'open-all';
const openAllLink = document.createElement('a');
openAllLink.textContent = 'Open All';
openAllLink.href = '#';
openAllLink.addEventListener('click', (event) => {
    event.preventDefault();
    console.log('Opening all related links in new tabs');
    chrome.tabs.create({ url: jobDetail.profileUrl });
    chrome.tabs.create({ url: jobDetail.jobUrl });
});
openAllElement.appendChild(openAllLink);

// Append all elements to the job listing container
jobListingElement.appendChild(jobTitleCompanyElement);
jobListingElement.appendChild(personJobElement);
jobListingElement.appendChild(openAllElement);

return jobListingElement;
};



const clearButton = document.getElementById('clearButton');
const jobListingsContainer = document.getElementById('jobListingsContainer');

// Request job details from the background script
chrome.runtime.sendMessage({ action: "requestJobDetails" }, (response) => {
    console.log('Received response for job details request:', JSON.stringify(response));
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

document.getElementById('clearButton').addEventListener('click', () => {
    console.log('Clicked Clear Button');
    jobListingsContainer.innerHTML = '';
    chrome.runtime.sendMessage({ action: "clearJobDetails" }, (response) => {
        console.log('Cleared job details, response:', response);
    });
});

document.getElementById('loadButton').addEventListener('click', () => {
    console.log('Load button clicked.');
    chrome.windows.getCurrent({}, (window) => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs.length > 0) {
                console.log('Active tab ID:', tabs[0].id, 'in window ID:', window.id);
                chrome.runtime.sendMessage({
                    action: "loadContentScript",
                    tabId: tabs[0].id,
                    windowId: window.id  // Pass the current window ID
                }, response => {
                    if (chrome.runtime.lastError) {
                        console.error('Error sending loadContentScript message:', chrome.runtime.lastError.message);
                    } else {
                        console.log('Load button action sent to background.js', response);
                    }
                });
            } else {
                console.log('No active tab found.');
            }
        });
    });
});

 document.getElementById('stopButton').addEventListener('click', () => {
    console.log('Clicked Stop Button');
    jobListingsContainer.innerHTML = '';
    chrome.runtime.sendMessage({ action: "stopScript" }, (response) => {
        console.log('Stopped Extension, response:', response);
    });
});
});

function updateLoadButtonState() {
chrome.storage.local.get('jobTitleSetByUser', (data) => {
    if (data.jobTitleSetByUser) {
        loadButton.disabled = false;
        console.log('Load button enabled: Job title is set in storage.');
    } else {
        loadButton.disabled = true;
        console.log('Load button disabled: No job title is set in storage.');
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

const jobTitleInput = document.getElementById('jobTitleInput');
const okButton = document.getElementById('ConfirmJobTitleButton');
const clearJobTitleButton = document.getElementById('clearJobTitleButton');
const loadButton = document.getElementById('loadButton');

// Set job title and enable load button
okButton.addEventListener('click', () => {
const jobTitle = jobTitleInput.value.trim();
if (jobTitle) {
    console.log(`Attempting to set job title: ${jobTitle}`);
    chrome.storage.local.set({ 'jobTitleSetByUser': jobTitle }, () => {
        console.log(`Job title set to: ${jobTitle}`);
        updateLoadButtonState();  // Update button state after setting job title
        updateJobTitleDisplay();
    });
} else {
    console.log("No job title entered. Attempting to clear any existing job title from storage.");
    chrome.storage.local.remove('jobTitleSetByUser', () => {
        console.log('Job title cleared from storage because the input was empty.');
        updateLoadButtonState();  // Update button state after clearing job title
        updateJobTitleDisplay();
    });
}
});


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



// Clear job title and disable load button
clearJobTitleButton.addEventListener('click', () => {
    console.log("Clear button clicked. Attempting to clear job title.");
    chrome.storage.local.remove('jobTitleSetByUser', () => {
        updateJobTitleDisplay(); // Clear the text box
        console.log('Job title cleared. Load button is now disabled.');
        loadButton.disabled = true; // Disable the Load button
    });
});

// Load the stored job title on popup open and adjust load button state
chrome.storage.local.get('jobTitleSetByUser', (data) => {
    if (data.jobTitleSetByUser) {
        console.log(`Retrieved job title: ${data.jobTitleSetByUser}`);
        jobTitleInput.value = data.jobTitleSetByUser;
        loadButton.disabled = false; // Enable Load button
    } else {
        console.log("No stored job title found. Load button is disabled.");
        loadButton.disabled = true; // Disable Load button
    }
});

document.getElementById('downloadCsvButton').addEventListener('click', function() {
    chrome.storage.local.get('jobDetails', (data) => {
        if (data.jobDetails && data.jobDetails.length > 0) {
            const csvContent = convertToCSV(data.jobDetails);
            triggerDownload(csvContent, 'job_details.csv');
        } else {
            console.log('No job details available to download.');
        }
    });
});

function convertToCSV(objArray) {
    const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
    let str = '';

    // Define column names in the specified order
    const columnNames = [
        "Company Name",
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
        ].map(field => `"${field.replace(/"/g, '""')}"`);  // Enclose each field in quotes and escape internal quotes

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
