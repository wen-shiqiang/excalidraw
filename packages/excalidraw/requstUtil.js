/**
 * 数据请求工具类
 */
import axios from "axios";
import QS from "qs";
const excalidrawData =
  JSON.parse(localStorage.getItem("excalidrawData") || "{}") || {};
axios.interceptors.request.use(
  (config) => {
    // 判断是否存在token，如果存在的话，则每个http header都加上token
    config.headers.Authtoken = excalidrawData.token || "";
    return config;
  },
  (err) => {
    return Promise.resolve(err);
  },
);

/*
请求返回错误码
*/
axios.interceptors.response.use(
  (data) => {
    return data;
  },

  (err) => {
    return Promise.resolve(err);
  },
);
// POST 请求
export const postRequest = (url, params, baseUrl) => {
  return axios({
    method: "post",
    url: `${baseUrl}${url}`,
    params,
    paramsSerializer(params) {
      return QS.stringify(params, { arrayFormat: "brackets" });
    },

    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
};
// POST 请求
export const postBodyRequest = (url, params, baseUrl) => {
  return axios({
    method: "post",
    url: `${baseUrl}${url}`,
    data: params,
    headers: {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
      },
    },
  });
};
// GET 请求
export const getRequest = (url, params, baseUrl) => {
  return axios({
    method: "get",
    url: `${baseUrl}${url}`,
    headers: { "X-Requested-With": "XMLHttpRequest" },
    params,
    paramsSerializer(params) {
      return QS.stringify(params, { arrayFormat: "brackets" });
    },
  });
};
