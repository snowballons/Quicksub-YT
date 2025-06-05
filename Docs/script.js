// Docs/script.js
document.addEventListener('DOMContentLoaded', function() {
    // Smooth scroll for navigation links
    document.querySelectorAll('nav ul li a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // Set current year in footer
    const currentYearElement = document.getElementById('currentYear');
    if (currentYearElement) {
        currentYearElement.textContent = new Date().getFullYear();
    }

    // Placeholder for Paddle/Keygen integration
    const upgradeButton = document.getElementById('upgradeButton');
    if (upgradeButton) {
        upgradeButton.addEventListener('click', function() {
            // This is where you would trigger your Paddle checkout
            // For example: Paddle.Checkout.open({ product: YOUR_PADDLE_PRODUCT_ID });
            alert('Upgrade button clicked! Implement Paddle.js checkout here.');
            console.log("Paddle Product ID would be triggered here.");
            // After successful payment, a webhook on your server would interact with Keygen.sh
            // to generate and email the key.
        });
    }

    // Disable links that are not yet ready
    const installFirefoxButton = document.getElementById('installFirefox');
    if (installFirefoxButton && installFirefoxButton.classList.contains('disabled')) {
        installFirefoxButton.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Firefox version is coming soon!');
        });
    }
    const allDownloadLinks = document.querySelectorAll('#download .cta-button.firefox.disabled');
    allDownloadLinks.forEach(link => {
         link.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Firefox version is coming soon!');
        });
    })

});