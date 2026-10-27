import axios from 'axios';
import { Platform } from 'react-native';

const configuredUrl = process.env.EXPO_PUBLIC_API_URL;
const defaultHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_BASE_URL = Platform.OS === 'web'
  ? '/api'
  : (configuredUrl || `http://${defaultHost}:4000/api`).replace(/\/$/, '');

const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });
let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});

export function apiErrorMessage(error) {
  return error?.response?.data?.error || error?.message || 'Something went wrong. Please try again.';
}

export default api;
