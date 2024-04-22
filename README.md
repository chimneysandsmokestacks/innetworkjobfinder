# Linkedin Job Finder Browser Extension

## Overview

This Chrome browser extension accomplishes three things: 
1. Allows the user to set a job title they're interested in.
2. Once launched in someone's LinkedIn list of connections, cycles through them and checks whether anyone works at companies that are hiring for the desired position.
3. Stores job posting, location, company, and relevant information about the connection to the company in storage, and allows for a CSV download.

### Background
I've found the most success in my job search through introductions to people who work in industries I'm interested in. 
LinkedIn is a popular platform for finding connections to companies, but the process can be very time-consuming: Looking at a friend's network, opening hundreds of profiles, finding the company jobs page. Because professional networks are often highly clustered around people's current and former jobs, this shouldn't take much time. But keeping track of which companies I already checked is difficult, and often not directly visible from a connection's friends list. This browser extension addresses this, by automatically cycling through a connection's network and checking for relevant job opportunities.

### Current Limitations and Potential Improvements
* Only searches for one job title at a time.
* Parses jobs from companies' abbreviated job pages. These job pages surface 2-3 jobs that most align with the user's job preferences as indicated in their profile.
* Because of how Linkedin's DOM creates dynamic elements, the job title of the person who works at a company with openings may not be accurate.
* The UI isn't pretty.
* The Stop button isn't active yet, just close the tab if you want to end the search.

### Features
* Stores all seen companies in local storage, and skips over opening a profile or jobs page when it is next detected in a person's headline or experience section.
* Stores all  objects in reference to the tab the user initiated the search on, which will allow for multi-threading in the future.
* Mimics human page interactions during search.
* Stores all scanned profiles and their current companies in the knownEmployees object in storage. This could be later used for network analysis.
* Allows user to open job opportunity and relevant connections in new tab from the browser extension.
* Creates a well-formatted CSV for download.

## Getting Started
To install this extension, download the files and put them all in one folder. Then open chrome://extensions in your browser and select 'Load Unpacked'. Select the folder.
Open someone's public connections list (usually by clicking the "500+ connections" link underneath their profile photo), and tailor your search to a specific industry or location via Linkedin's native filters. Open the extension and set a job title, then click Load.
