// Frontend settings. Nothing here is secret: every visitor can read this file.
// Everything runs on this PC:
//   - START.bat (Docker): the website is on localhost:8080 and the API on localhost:3000.
//   - DEPLOY-FLOCI.bat (the doctor's lab setup): the website is in an S3 bucket on Floci and the
//     API is API Gateway + Lambda on Floci. The deploy script replaces this file in the bucket
//     with the API Gateway address it just created.
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  || window.location.hostname.endsWith('.localhost');

const API_BASE_URL = 'http://localhost:3000/api';
