import axios from 'axios';
import { reactive } from 'vue';

export default defineNuxtPlugin((nuxtApp) => {
    const url_api = useRuntimeConfig().public.apiBase;

    const api = axios.create({
        baseURL: url_api,
        timeout: 15000
    })

    api.interceptors.response.use(
        (response) => {
            return response;
        },
        async (error) => {
            const originalRequest = error.config;

            if (error.response && error.response.status === 401 && !originalRequest._retry) {
                originalRequest._retry = true;

                try {
                    const currentToken = localStorage.getItem("agendaspro_jwt");

                    const { data } = await axios.post(`${url_api}/users/check_jwt`, {
                        token: `Bearer ${currentToken}`
                    });

                    const newToken = data.returnObj.newToken;

                    localStorage.setItem("agendaspro_jwt", newToken);
                    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

                    originalRequest.headers['Authorization'] = `Bearer ${newToken}`;

                    return api(originalRequest);
                } catch (refreshError) {
                    localStorage.removeItem("agendaspro_jwt");
                    window.location.href = "/entrar";
                    return Promise.reject(refreshError);
                }
            }

            return Promise.reject(error);
        }
    );

    nuxtApp.provide('base', {
        api
    });
  });

