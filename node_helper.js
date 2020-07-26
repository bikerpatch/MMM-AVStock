const request = require('request')
const moment = require("moment")

var NodeHelper = require("node_helper")

String.prototype.hashCode = function() {
  var hash = 0
  if (this.length == 0) {
    return hash
  }
  for (var i = 0; i < this.length; i++) {
    var char = this.charCodeAt(i)
    hash = ((hash<<5)-hash)+char
    hash = hash & hash
  }
  return hash
}

module.exports = NodeHelper.create({
  start: function() {
    this.config = new Map();
  },

  socketNotificationReceived: function(noti, payload) {

    if (noti == "INIT") {
      this.config.set(payload.instanceId, payload.config);
      console.log("[AVSTOCK] Initialized for instance ", payload.instanceId);
    }
    if (noti == "FETCH") {
      if (this.config.get(payload.instanceId).debug == true) console.log("[AVSTOCK] Fetch notification recevied, instance ", payload.instanceId)
      
      this.callAPI(payload.instanceId, payload.config, payload.symbol, (noti, payload)=>{
        this.sendSocketNotification(noti, payload);
      });

    }
  },

  callAPI: function(instanceId, cfg, symbol, callback) {
    var url = ""
    if (cfg.mode != "series") {
      url = "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol="
    } else {
      url = "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol="
    }
    url += symbol + "&apikey=" + cfg.apiKey

    request(url, (error, response, body)=>{
      if (this.config.get(instanceId).debug == true) console.log("[AVSTOCK] API is called - ", instanceId, symbol);
      var data = null
      if (error) {
        console.log("[AVSTOCK] API Error: ", error)
        return
      }
      
      data = JSON.parse(body)
      if (data.hasOwnProperty("Note")) {
        if (this.config.get(instanceId).debug == true) console.log("[AVSTOCK] API body - ", instanceId, body);
        console.log("[AVSTOCK] Error: API Call limit exceeded - ", instanceId)
      }
      if (data.hasOwnProperty("Error Message")) {
        console.log("[AVSTOCK] Error:", instanceId, data["Error Message"])
      }
      if (data["Global Quote"]) {
        if (!data["Global Quote"].hasOwnProperty("01. symbol")) {
          console.log("[AVSTOCK] Data Error: There is no available data for", instanceId, symbol)
        }
        //console.log("[AVSTOCK] Response is parsed - ", symbol)
        var dec = this.config.get(instanceId).decimals		//decimal Factor, converts decimals to numbers that needs to be multiplied for Math.round
        var result = {
          "symbol": data["Global Quote"]["01. symbol"],
          "open": parseFloat(data["Global Quote"]["02. open"]).toFixed(dec),
          "high": parseFloat(data["Global Quote"]["03. high"]).toFixed(dec),
          "low": parseFloat(data["Global Quote"]["04. low"]).toFixed(dec),
          "price": parseFloat(data["Global Quote"]["05. price"]).toFixed(dec),
          "volume": parseInt(data["Global Quote"]["06. volume"]).toLocaleString(),
          "day": data["Global Quote"]["07. latest trading day"],
          "close": parseFloat(data["Global Quote"]["08. previous close"]).toFixed(dec),
          "change": parseFloat(data["Global Quote"]["09. change"]).toFixed(dec),
          "changeP": parseFloat(data["Global Quote"]["10. change percent"]).toFixed(dec)+"%",
          "requestTime": moment().format(cfg.timeFormat),
          "hash": symbol.hashCode()
        }
        callback('UPDATE', {instanceId: instanceId, result: result})
      } else if (data["Time Series (Daily)"]) {
        //console.log("[AVSTOCK] Response is parsed - ", symbol)
        var series = data["Time Series (Daily)"]
        var keys = Object.keys(series)
        var dayLimit = (cfg.chartDays > 90) ? 90 : cfg.chartDays
        var keys = keys.sort().reverse().slice(0, dayLimit)
        var ts = []
        for (k in keys) {
          var index = keys[k]
          var item = {
            "symbol": symbol,
            "date": index,
            "open": series[index]["1. open"],
            "high": series[index]["2. high"],
            "low": series[index]["3. low"],
            "close": series[index]["4. close"],
            "volume": series[index]["5. volume"],
            "hash" : symbol.hashCode(),
            "requestTime": moment().format(cfg.timeFormat),
            "candle": null
          }
          item.candle = ((item.close - item.open) >= 0) ? "up" : "down"
          ts.push(item)
        }
        callback('UPDATE_SERIES', {instanceId: instanceId, ts: ts})
      }
    })
  }

})
