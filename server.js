require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");
const e = require("express");

// 是否啟用 Proxy
const ENABLE_PROXY = process.env.ENABLE_PROXY === "true"; // ✅ 檢查環境變數
let proxyAgent = null;

if (ENABLE_PROXY) {
  const proxyUrl = `http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
  proxyAgent = new HttpsProxyAgent(proxyUrl);
  console.log(`✅ 已啟用 Proxy: ${proxyUrl}`);
} else {
  console.log("⚠️ 未啟用 Proxy，直接連線 API");
}

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 動態取得指定縣市的天氣預報
 * CWA 氣象資料開放平臺 API
 * 使用「一般天氣預報-今明 36 小時天氣預報」資料集
 */
const getWeather36hrByCity = async (req, res) => {
  try {
    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 從路由參數取得縣市名稱
    const cityName = req.params.city;
    if (!cityName) {
      return res.status(400).json({
        error: "請提供縣市名稱",
        message:
          "路徑格式：/api/weather_36hr/:city，例如 /api/weather_36hr/高雄市",
      });
    }

    // 呼叫 CWA API - 一般天氣預報（36小時）
    // API 文件: https://opendata.cwa.gov.tw/dist/opendata-swagger.html
    const axiosConfig = {
      params: {
        Authorization: CWA_API_KEY,
        locationName: cityName,
      },
    };
    // 如果啟用 Proxy，加入 httpsAgent 與 proxy: false
    if (ENABLE_PROXY && proxyAgent) {
      axiosConfig.httpsAgent = proxyAgent;
      axiosConfig.proxy = false;
    }

    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      axiosConfig
    );

    // 取得縣市的天氣資料
    const locationData = response.data.records.location[0];
    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: `無法取得${cityName}天氣資料`,
      });
    }

    // 整理天氣資料
    const weatherData = {
      city: locationData.locationName,
      updateTime: response.data.records.datasetDescription,
      forecasts: [],
    };

    // 解析天氣要素
    const weatherElements = locationData.weatherElement;
    const timeCount = weatherElements[0].time.length;

    for (let i = 0; i < timeCount; i++) {
      const forecast = {
        startTime: weatherElements[0].time[i].startTime,
        endTime: weatherElements[0].time[i].endTime,
        weather: "",
        rain: "",
        minTemp: "",
        maxTemp: "",
        comfort: "",
        windSpeed: "",
      };

      weatherElements.forEach((element) => {
        const value = element.time[i].parameter;
        switch (element.elementName) {
          case "Wx":
            forecast.weather = value.parameterName;
            break;
          case "PoP":
            forecast.rain = value.parameterName + "%";
            break;
          case "MinT":
            forecast.minTemp = value.parameterName + "°C";
            break;
          case "MaxT":
            forecast.maxTemp = value.parameterName + "°C";
            break;
          case "CI":
            forecast.comfort = value.parameterName;
            break;
          case "WS":
            forecast.windSpeed = value.parameterName;
            break;
        }
      });

      weatherData.forecasts.push(forecast);
    }

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      // API 回應錯誤
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    // 其他錯誤
    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

/**
 * 動態取得指定縣市的天氣警特報
 * CWA 氣象資料開放平臺 API
 * 使用「天氣警特報」資料集
 */
const getWeatherHazardsByCity = async (req, res) => {
  try {
    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 從路由參數取得縣市名稱
    const cityName = req.params.city;
    if (!cityName) {
      return res.status(400).json({
        error: "請提供縣市名稱",
        message:
          "路徑格式：/api/weather_hazards/:city，例如 /api/weather_hazards/高雄市",
      });
    }

    // 呼叫 CWA API - 天氣警特報
    // API 文件: https://opendata.cwa.gov.tw/dist/opendata-swagger.html
    const axiosConfig = {
      params: {
        Authorization: CWA_API_KEY,
        locationName: cityName,
      },
    };
    // 如果啟用 Proxy，加入 httpsAgent 與 proxy: false
    if (ENABLE_PROXY && proxyAgent) {
      axiosConfig.httpsAgent = proxyAgent;
      axiosConfig.proxy = false;
    }

    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/W-C0033-001`,
      axiosConfig
    );

    // 取得縣市的天氣警特報
    const locationData = response.data.records.location[0];
    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: `無法取得${cityName}天氣資料`,
      });
    }

    // 取出 hazards 並轉換格式
    const hazardsArray = locationData.hazardConditions.hazards.map((h) => ({
      phenomena: h.info.phenomena,
      startTime: h.validTime.startTime,
      endTime: h.validTime.endTime,
    }));

    // 整理hazards資料
    const hazardsData = {
      city: locationData.locationName,
      hazards: hazardsArray,
    };

    res.json({
      success: true,
      data: hazardsData,
    });
  } catch (error) {
    console.error("取得警特報資料失敗:", error.message);

    if (error.response) {
      // API 回應錯誤
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得警特報資料",
        details: error.response.data,
      });
    }

    // 其他錯誤
    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得警特報資料，請稍後再試",
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API",
    endpoints: {
      weather_36hr: {
        url: "/api/weather_36hr/:city",
        description: "取得指定縣市的今明 36 小時天氣預報",
        example: "/api/weather_36hr/臺北市",
      },
      weather_hazards: {
        url: "/api/weather_hazards/:city",
        description: "取得指定縣市的天氣警特報",
        example: "/api/weather_hazards/高雄市",
      },
      health: "/api/health",
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 取得天氣預報
app.get("/api/weather_36hr/:city", getWeather36hrByCity);

// 取得天氣警特報
app.get("/api/weather_hazards/:city", getWeatherHazardsByCity);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});
