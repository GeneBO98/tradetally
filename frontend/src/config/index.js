// Frontend configuration
export const config = {
  // Feature flags
  showDonationButton: import.meta.env.VITE_SHOW_DONATION_BUTTON !== 'false', // Default to true unless explicitly set to false
  
  // API configuration
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
  
  // Other configuration options can be added here
}

export default config