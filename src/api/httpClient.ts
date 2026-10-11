import axios from 'axios';

/**
 * The one Axios instance every API call goes through: same-origin '/api'
 * (the MSW worker answers it in every environment) and a hard timeout so
 * a hung request fails loudly instead of spinning forever.
 */
export const httpClient = axios.create({
  baseURL: '/api',
  timeout: 5000,
});
