// popup/popup.js (Simplified Launcher)
console.log("Popup launcher script loaded.");

document.addEventListener('DOMContentLoaded', function() {
    const openImporterButton = document.getElementById('openImporterButton');

    openImporterButton.addEventListener('click', function() {
        // Use chrome.runtime.getURL to get the correct path to importer.html
        const importerPageUrl = chrome.runtime.getURL("importer.html");

        // Check if an importer tab is already open
        chrome.tabs.query({ url: importerPageUrl }, function(tabs) {
            if (tabs.length > 0) {
                // If found, focus the existing tab
                chrome.tabs.update(tabs[0].id, { active: true });
                if (tabs[0].windowId) { // Also focus the window
                    chrome.windows.update(tabs[0].windowId, { focused: true });
                }
            } else {
                // If not found, create a new tab
                chrome.tabs.create({ url: importerPageUrl });
            }
            window.close(); // Close the popup after action
        });
    });
});