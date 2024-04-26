# Linkedin Job Finder Browser Extension

## Overview

This Chrome browser extension accomplishes three things: 
1. Allows the user to set one or more job title(s) they're interested in.
2. Once launched in someone's LinkedIn list of connections, cycles through each profile and checks whether they work at companies that are hiring for the desired position(s).
3. Stores job posting, location, company, and relevant information about the connection in storage, and allows for a CSV download.

### Background
I've found the most success in my job search through introductions to people who work in industries I'm interested in. 
LinkedIn is a popular platform for finding connections to companies that are hiring, but the process is very time-consuming. Because professional networks are often highly clustered around people's current and former jobs, this shouldn't take much time. But keeping track of which companies I already checked is difficult, and not directly visible from a connection's friends list. This browser extension addresses this issue by automatically cycling through a connection's network and checking for relevant job opportunities.

### Current Limitations and Potential Improvements
* Parses jobs from companies' abbreviated job pages. These job pages surface 2-3 jobs that most align with the user's job preferences as indicated in their LinkedIn profile.
* Because of how Linkedin's DOM dynamic DOM, the job title of the person working at a company with openins may not be accurate.

### Features
* Allows the user to set multiple job titles.
* Allows the user to limit how many profiles they will visit in a 24h period.
* Stores all seen companies in local storage, and skips over opening a jobs page when it is next detected in a person's search results headline or experience section.
* Skips visiting profiles that were visited in the previous week (assumes people don't switch companies as often).
* Mimics human page interactions.
* Allows user to open job opportunities and relevant connections in new tabs directly from the browser extension.
* Creates a well-formatted CSV for download.

## Getting Started
To install this extension, download the files and put them all in one folder. Then open chrome://extensions in your browser and select 'Load Unpacked'. Select the folder.
Open someone's public connections list (usually by clicking the "500+ connections" link underneath their profile photo), and tailor your search to a specific industry or location via Linkedin's native filters. Open the extension and set a job title, then click Load.
