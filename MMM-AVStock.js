String.prototype.hashCode = function() {
    var hash = 0;
    if (this.length == 0) {
        return hash;
    }
    for (var i = 0; i < this.length; i++) {
        var char = this.charCodeAt(i);
        hash = ((hash<<5)-hash)+char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
}

const header = ["symbol", "price", "close", "change", "changeP", "volume"]
const headerTitle = ["Symbol", "Cur.Price", "Prev.Close", "CHG", "CHG%", "Volume"]

Module.register("MMM-AVStock", {
  defaults: {
    debug: false,
    apiKey : "",
    timeFormat: "DD-MM HH:mm",
    symbols : ["aapl", "GOOGL", "005930.KS"],
    alias: ["APPLE", "", "SAMSUNG Electronics"],
    tickerDuration: 60,
    chartDays: 90,
    poolInterval : 1000*15, // (Changed in ver 1.1.0) - Only For Premium Account
    mode : "table", // "table", "ticker", "series"
    decimals : 4,
    candleSticks: false,
    coloredCandles: true,
    premiumAccount: false, // To change poolInterval, set this to true - Only For Premium Account
  },

  getStyles: function() {
    return ["MMM-AVStock.css"]
  },

  start: function() {
    this.sendSocketNotification("INIT", {instanceId: this.identifier, config: this.config});
    this.stocks = {};
    this.pooler = [];
    this.isStarted = false;
    this.doneFirstPooling = false;
  },

  startPooling: function() {
    // Since December 2018, Alphavantage changed API quota limit.(500 per day)
    // So, fixed interval is used. for the first cycle, 15sec is used.
    // After first cycle, 3min is used for interval to match 500 quota limits.
    // So, one cycle would be 3min * symbol length;
    var interval = 0
    if (this.config.premiumAccount) {
      interval = this.config.poolInterval
    } else {
      interval = (this.doneFirstPooling) ? 180000 : 15000
    }

    clearTimeout(this.timer);
    this.timer = null;

    if (this.config.debug == true) console.log("[AVSTOCK] Interval: ", interval);

    if (this.pooler.length > 0) {
      var symbol = this.pooler.shift();
      if (this.config.debug == true) console.log("[AVSTOCK] Shifted: ", symbol);
      
      this.sendSocketNotification("FETCH", {symbol: symbol, config: this.config, instanceId: this.identifier});

    } else {
      this.doneFirstPooling = true
      this.prepareScan()
    }

    var self = this;
    this.timer = setTimeout( function() {
      self.startPooling();
    }, interval); //update according to the config
  },

  prepareScan: function() {
    for (s in this.config.symbols) {
      var symbol = this.config.symbols[s];
      this.pooler.push(symbol);
      if (this.config.debug == true) console.log("[AVSTOCK] Pushed: ", symbol);
    }
  },

  getDom: function() {
    var wrapper = document.createElement("div")
    wrapper.id = "AVSTOCK"
    wrapper.classList.add("avstock");
    return wrapper
  },

  prepare: function() {
    switch (this.config.mode) {
      case "table":
        this.prepareTable()
        break
      case "ticker":
        this.prepareTicker()
        break
      case "series":
        this.prepareSeries()
        break
    }
  },

  getStockName: function(symbol) {
    var stockAlias = symbol
    var i = this.config.symbols.indexOf(symbol)
    if (this.config.symbols.length == this.config.alias.length) {
      stockAlias = (this.config.alias[i]) ? this.config.alias[i] : stockAlias
    }
    return stockAlias
  },

  prepareSeries: function() {
    var wrapper = document.querySelector('#' + this.identifier + ' #AVSTOCK');
    wrapper.innerHTML = ""

    var stock = document.createElement("div")
    stock.innerHTML = ""
    stock.id = "AVSTOCK_SERIES";
    stock.className = "stock"
    stock.classList.add("avstock_series");

    var symbol = document.createElement("div")
    symbol.className = "symbol"
    symbol.innerHTML = "Loading..."
    symbol.id = "symbol_series"

    var price = document.createElement("div")
    price.className = "price"
    price.innerHTML = "---"
    price.id = "price_series"

    var change = document.createElement("div")
    change.className = "change"
    change.innerHTML = "---"
    change.id = "change_series"

    var anchor = document.createElement("div")
    anchor.className = "anchor"

    anchor.appendChild(price)
    anchor.appendChild(change)

    stock.appendChild(symbol)
    stock.appendChild(anchor)
    wrapper.appendChild(stock)

    var cvs = document.createElement("canvas")
    cvs.id = "AVSTOCK_CANVAS"
    cvs.classList.add("avstock_canvas");
    wrapper.appendChild(cvs)

    var tl = document.createElement("div")
    tl.className = "tagline"
    tl.id = "AVSTOCK_TAGLINE"
    tl.classList.add("avstock_tagline");
    tl.innerHTML = "Last updated : "
    wrapper.appendChild(tl)

    var cvs = document.querySelector('#' + this.identifier + ' #AVSTOCK_CANVAS');
    cvs.width = cvs.clientWidth
    cvs.height = cvs.clientHeight
  },

  prepareTable: function() {
    var wrapper = document.querySelector('#' + this.identifier + ' #AVSTOCK');
    wrapper.innerHTML = ""

    var tbl = document.createElement("table")
    tbl.id = "AVSTOCK_TABLE"
    tbl.classList.add("avstock_table");
    var thead = document.createElement("thead")
    var tr = document.createElement("tr")
    for (i in header) {
      var td = document.createElement("td")
      td.innerHTML = headerTitle[i]
      td.className = header[i]
      tr.appendChild(td)
    }
    thead.appendChild(tr)
    tbl.appendChild(thead)

    for (i in this.config.symbols) {
      var stock = this.config.symbols[i]
      var hashId = stock.hashCode()
      var tr = document.createElement("tr")
      tr.className = "stock"
      tr.id = "STOCK_" + hashId
      for (j in header) {
        var td = document.createElement("td")
        var stockAlias = this.getStockName(stock)
        td.innerHTML = (j != 0) ? "---" : stockAlias
        td.className = header[j]
        td.id = header[j] + "_" + hashId
        tr.appendChild(td)
      }
      tbl.appendChild(tr)
    }
    wrapper.appendChild(tbl)
    var tl = document.createElement("div")
    tl.className = "tagline"
    tl.id = "AVSTOCK_TAGLINE"
    tl.innerHTML = "Last updated : "
    wrapper.appendChild(tl)
  },

  prepareTicker: function() {
    var wrapper = document.querySelector('#' + this.identifier + ' #AVSTOCK');
    wrapper.innerHTML = ""
    var wrap = document.createElement("div")
    wrap.className = "ticker-wrap"
    var ticker = document.createElement("div")
    ticker.className = "ticker"
    ticker.style.animationDuration = this.config.tickerDuration + "s";
    for (i in this.config.symbols) {
      var stock = this.config.symbols[i]
      var hashId = stock.hashCode()
      var item = document.createElement("div")
      item.className = "ticker__item stock"
      item.id = "STOCK_" + hashId

      var symbol = document.createElement("div")
      symbol.className = "symbol item_sect"
      symbol.innerHTML = this.getStockName(stock)
      symbol.id = "symbol_" + hashId

      var price = document.createElement("div")
      price.className = "price"
      price.innerHTML = "---"
      price.id = "price_" + hashId

      var change = document.createElement("div")
      change.className = "change"
      change.innerHTML = "---"
      change.id = "change_" + hashId

      var anchor = document.createElement("div")
      anchor.className = "anchor item_sect"

      anchor.appendChild(price)
      anchor.appendChild(change)
      item.appendChild(symbol)
      item.appendChild(anchor)
      ticker.appendChild(item)
    }

    wrap.appendChild(ticker)
    wrapper.appendChild(wrap)
  },

  notificationReceived: function(noti, payload) {
    if (noti == "DOM_OBJECTS_CREATED") {
      if (this.pooler.length == 0) {
        this.prepareScan()
      }
      this.startPooling()
      this.prepare() 
    }
  },

  socketNotificationReceived: function(noti, payload) {
    if (payload.hasOwnProperty('instanceId') && (payload.instanceId == this.identifier)) {
      if (this.config.debug == true) console.log("[AVSTOCK] Notification Received: ", noti);
      if (noti == "UPDATE") {
        if (payload.hasOwnProperty('symbol')) {
          this.stocks[payload.result.symbol] = payload.result
          this.update(payload.result)
        }
      }
      if (noti == "UPDATE_SERIES") {
        this.updateSeries(payload.ts)
      }
    }
  },

  update: function(stock) {
    switch (this.config.mode) {
      case "table":
        this.drawTable(stock)
        break
      case "ticker":
        this.drawTicker(stock)
        break
    }
  },

  updateSeries: function(series) {
    this.drawSeries(series)
  },

  drawSeries: function(series) {
    var max = 0
    var min = 0
    var symbol = ""
    var co = []
    var ud = ""
    var changeV = 0
    var lastPrice = 0
    var requestTime = ""

    var moduleDom = document.getElementById(this.identifier);

    //determine max, min etc. for graph size
    for(i in series) {
      var s = series[i]
      co[i] = s.close
      if (i == 0) {
        max = s.close
        min = s.close
        symbol = s.symbol
        ud = s.candle
        lastPrice = s.close
        requestTime = s.requestTime
      } else if (!this.config.candleSticks) {
        if (s.close > max) {
          max = s.close
        }
        if (s.close < min) {
          min = s.close
        }
      } else {
        if (s.high > max) {
          max = s.high
        }
        if (s.low < min) {
          min = s.low
        }
      }
      if (i == 1) {
          changeV = Math.round((lastPrice - s.close) * 10000) / 10000
      }
    }

    var cvs = document.querySelector('#' + this.identifier + ' #AVSTOCK_CANVAS');
    var ctx = cvs.getContext("2d")
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

    ctx.beginPath()   //draw line or candle stick chart
    var xs = Math.round(((ctx.canvas.width)-10) / series.length)
    var x = 5
    var y = 0
    var y2 = 0
    ctx.strokeStyle = "#FFFFFF"
    ctx.lineWidth = 3
    if (!this.config.candleSticks) {
      ctx.beginPath()
      while (series.length > 0) {
        var t = series.pop()
        var c = t.close
        y = ctx.canvas.height - (((c - min) / (max - min)) * ctx.canvas.height)
        ctx.lineTo(x, y)
        x += xs
      }
      ctx.stroke()
    } else {
      while (series.length > 0) {
        var t = series.pop()
        ctx.lineWidth = 1
        y = ctx.canvas.height - (((t.high - min) / (max - min)) * ctx.canvas.height)
        y2 = ctx.canvas.height - (((t.low - min) / (max - min)) * ctx.canvas.height)
        ctx.beginPath()    //drawing the candlestick from t.high to t.low
        ctx.moveTo(x, y)
        ctx.lineTo(x, y2)
        ctx.stroke()
        ctx.beginPath()  //drawing the candle from t.open to t.close
        var rectMinY = ctx.canvas.height - (((Math.min (t.close, t.open) - min) / (max - min)) * ctx.canvas.height)
        var rectMaxY = ctx.canvas.height - (((Math.max (t.close, t.open) - min) / (max - min)) * ctx.canvas.height)
        if (this.config.coloredCandles) {
          ctx.fillStyle = ((t.close < t.open) ? "red" : "green")
        } else {
          ctx.fillStyle = ((t.close < t.open) ? "black" : "white")
        }
        ctx.fillRect(x-Math.round(xs/2)+2, rectMinY, xs-4, rectMaxY-rectMinY)      //filled black or white (or colored) candle written above the candlestick
        ctx.strokeRect(x-Math.round(xs/2)+2, rectMinY, xs-4, rectMaxY-rectMinY)    //white border
        x += xs
      }
    }


    var stock = document.querySelector('#' + this.identifier + ' #symbol_series');
    stock.innerHTML = this.getStockName(symbol)
    var price = document.querySelector('#' + this.identifier + ' #price_series');
    price.innerHTML = lastPrice
    var change = document.querySelector('#' + this.identifier + ' #change_series');
    change.innerHTML = changeV

    var tr = document.querySelector('#' + this.identifier + ' #AVSTOCK_SERIES');
    tr.className = "avstock_series animated stock " + ud
    var tl = document.querySelector('#' + this.identifier + ' #AVSTOCK_TAGLINE');
    tl.innerHTML = "Last updated: " + requestTime
    setTimeout(()=>{
      tr.className = "avstock_series stock " + ud
    }, 1500);
  },

  drawTable: function(stock) {
    var hash = stock.hash
    var tr = document.querySelector('#' + this.identifier + ' #STOCK_' + hash)
    var ud = ""
    for (j = 1 ; j <= 5 ; j++) {
      var tdId = header[j] + "_" + hash
      var td = document.getElementById(tdId)
      td.innerHTML = stock[header[j]]
      td.className = header[j]
      if (header[j] == "change") {
        if (stock[header[j]] > 0) {
          ud = "up"
        } else if (stock[header[j]] < 0) {
          ud = " down"
        }
      }
    }
    tr.className = "animated stock " + ud
    var tl = document.querySelector('#' + this.identifier + ' #AVSTOCK_TAGLINE');
    tl.innerHTML = "Last updated: " + stock.requestTime
    setTimeout(()=>{
      tr.className = "stock " + ud
    }, 1500);
  },

  drawTicker: function(stock) {
    var hash = stock.hash
    var tr = document.querySelector('#' + this.identifier + ' #STOCK_' + hash)
    var ud = ""
    var price = document.querySelector('#' + this.identifier + ' #price_' + hash)
    price.innerHTML = stock.price
    var change = document.querySelector('#' + this.identifier + ' #change_' + hash)
    change.innerHTML = stock.change
    if (stock.change > 0) {
      ud = "up"
    } else if (stock.change < 0) {
      ud = "down"
    }
    tr.className = "animated ticker__item stock " + ud
    setTimeout(()=>{
      tr.className = "ticker__item stock " + ud
    }, 1500);
  },
})
