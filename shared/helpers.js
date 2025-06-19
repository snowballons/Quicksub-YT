// shared/helpers.js

// From background.js
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 
export function isValidYouTubeChannelUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const youtubeChannelRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(channel\/UC[\w-]{21}[A-Za-z0-9]|c\/[\w-]+|user\/[\w-]+|@[\w.-]+)(\/\S*)?)$/;
  return youtubeChannelRegex.test(url);
}

// From 
export function formatTime(milliseconds) {
  if (milliseconds < 0) milliseconds = 0;
  let totalSeconds = Math.floor(milliseconds / 1000);
  let minutes = Math.floor(totalSeconds / 60);
  let seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
