const logger = require('./logger');

/**
 * Formats a date string into 'dd MMMM yyyy' format for MIFOS.
 * @param {string} dateString - The date string to format.
 * @returns {string|null} The formatted date string or null if input is invalid.
 */
function formatDateForMifos(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null; // Invalid date

    const day = date.getDate();
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}

module.exports = {
    formatDateForMifos
};
