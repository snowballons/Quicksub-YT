// offscreen.js
console.log("Offscreen document v2.7 (Optimized Webpage Scan) loaded.");

/**
 * Validates YouTube channel URLs using regex pattern matching.
 * Supports channel/, c/, user/, and @ URL formats.
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if valid YouTube channel URL
 */
function simpleIsValidYouTubeChannelUrl(url) {
    if (!url || typeof url !== 'string') return false;
    // Regex to match common YouTube channel URL patterns
    const youtubeChannelRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(channel\/UC[\w-]{21}[A-Za-z0-9]|c\/[\w-]+|user\/[\w-]+|@[\w.-]+)(\/\S*)?)$/;
    return youtubeChannelRegex.test(url);
}

chrome.runtime.onMessage.addListener(handleMessages);

async function handleMessages(request, _sender, _sendResponse) {
    if (request.target !== 'offscreen') {
        return false;
    }
    let processed = false;

    if (request.action === 'scanHtmlForYouTubeChannels') {
        processed = true;
        console.log("Offscreen: Received HTML to scan from base URL:", request.basePageUrl);
        const { htmlText, basePageUrl } = request;
        const foundChannelUrls = new Set(); // Use Set to automatically handle duplicates
        let parseError = null;

        try {
            // Parse the HTML using DOMParser for safe DOM manipulation
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, "text/html");
            const anchorTags = doc.querySelectorAll('a');

            console.log(`Offscreen: Found ${anchorTags.length} anchor tags to scan.`);

            // Process each anchor tag to find YouTube channel URLs
            anchorTags.forEach(a => {
                let href = a.getAttribute('href');
                if (href) {
                    try {
                        // Resolve relative URLs against the base page URL
                        const absoluteUrl = new URL(href, basePageUrl).href;

                        if (simpleIsValidYouTubeChannelUrl(absoluteUrl)) {
                            // Sanitize URL: remove query params and hash for consistency
                            const urlObj = new URL(absoluteUrl);
                            const sanitizedUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
                            foundChannelUrls.add(sanitizedUrl);
                        }
                    } catch (e) {
                        // Silently skip invalid or non-resolvable URLs
                        // This is expected for malformed href attributes
                    }
                }
            });
        } catch (e) {
            console.error("Offscreen: DOMParser error during webpage scan:", e);
            parseError = `DOM parsing error: ${e.message}`;
        }

        const resultUrls = Array.from(foundChannelUrls);
        console.log(`Offscreen: Extracted ${resultUrls.length} unique YouTube channel URLs.`);

        // Send results back to background script
        if (parseError) {
            // Send error with any URLs found before the error occurred
            chrome.runtime.sendMessage({
                action: 'scanHtmlResult',
                error: parseError,
                foundUrls: resultUrls // Partial results if any
            });
        } else if (resultUrls.length > 0) {
            // Send successful results
            chrome.runtime.sendMessage({
                action: 'scanHtmlResult',
                foundUrls: resultUrls
            });
        } else {
            // Send empty results with informative message
            chrome.runtime.sendMessage({
                action: 'scanHtmlResult',
                foundUrls: [], // Explicitly empty array
                message: "No YouTube channel URLs found on the page."
            });
        }
    } // end of scanHtmlForYouTubeChannels handler

    return processed;
}