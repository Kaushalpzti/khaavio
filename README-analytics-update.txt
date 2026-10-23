Khaavio Analytics Update

Copy these files into your Khaavio project, preserving paths:

src/App.jsx                         <- App.jsx
src/pages/Dashboard.jsx             <- Dashboard.jsx
src/pages/Analytics.jsx             <- Analytics.jsx
src/pages/Analytics.css             <- Analytics.css

Do not replace .env.local or any Supabase credentials.

After copying, run in the project folder:
  npm run lint
  npm run build

This analytics screen summarizes orders created in the last 30 days and upcoming bookings in the next 90 days. “Completed order value” counts orders whose status is completed; it is not a payment-settlement report.
