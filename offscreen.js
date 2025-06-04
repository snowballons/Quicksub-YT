// offscreen.js
console.log("Offscreen document v2 (Webpage Scan) loaded.");

// Re-add a basic isValidYouTubeChannelUrl or ensure it can be messaged if complex
function simpleIsValidYouTubeChannelUrl(url) {
    if (!url || typeof url !== 'string') return false;
    // Regex to match common YouTube channel URL patterns
    const youtubeChannelRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(channel\/UC[\w-]{21}[A-Za-z0-9]|c\/[\w-]+|user\/[\w-]+|@[\w.-]+)(\/\S*)?)$/;
    return youtubeChannelRegex.test(url);
}

chrome.runtime.onMessage.addListener(handleMessages);

async function handleMessages(request, sender, sendResponse) {
    if (request.target !== 'offscreen') {
        return false;
    }
    let processed = false;

    if (request.action === 'scanHtmlForYouTubeChannels') {
        processed = true;
        console.log("Offscreen: Received HTML to scan from base URL:", request.basePageUrl);
        const { htmlText, basePageUrl } = request;
        const foundChannelUrls = new Set(); // Use a Set to store unique URLs
        let parseError = null;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, "text/html");
            const anchorTags = doc.querySelectorAll('a');

            console.log(`Offscreen: Found ${anchorTags.length} anchor tags.`);

            anchorTags.forEach(a => {
                let href = a.getAttribute('href');
                if (href) {
                    try {
                        // Resolve relative URLs against the base page URL
                        const absoluteUrl = new URL(href, basePageUrl).href;

                        if (simpleIsValidYouTubeChannelUrl(absoluteUrl)) {
                            // Sanitize: remove query params and hash
                            const urlObj = new URL(absoluteUrl);
                            const sanitizedUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
                            foundChannelUrls.add(sanitizedUrl);
                        }
                    } catch (e) {
                        // console.warn(`Offscreen: Skipping invalid or non-resolvable href: ${href}`, e.message);
                    }
                }
            });
        } catch (e) {
            console.error("Offscreen: DOMParser error during webpage scan:", e);
            parseError = `DOM parsing error: ${e.message}`;
        }

        const resultUrls = Array.from(foundChannelUrls);
        console.log(`Offscreen: Extracted ${resultUrls.length} unique YouTube channel URLs.`);

        if (parseError) {
            chrome.runtime.sendMessage({
                action: 'scanHtmlResult',
                error: parseError,
                foundUrls: resultUrls // Send any URLs found before the error
            });
        } else if (resultUrls.length > 0) {
            chrome.runtime.sendMessage({
                action: 'scanHtmlResult',
                foundUrls: resultUrls
            });
        } else {
            chrome.runtime.sendMessage({
                action: 'scanHtmlResult',
                foundUrls: [], // Send empty array explicitly
                message: "No YouTube channel URLs found on the page."
            });
        }
    } // end of if 'scanHtmlForYouTubeChannels'

    return processed;
}