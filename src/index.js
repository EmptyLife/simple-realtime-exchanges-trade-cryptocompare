
const EventEmitter = require('events')

const assert = require("assert")

const socketIOClient = require("socket.io-client")

const CCC = require("./lib/ccc")
const TimeNormalize = require("./lib/timeNormalize")


const STREAM_URL = "https://streamer.cryptocompare.com/";

class ExchangeTrade {
	constructor(events, exchange, symbol) {
		this.events = events;
		this.exchange = exchange.toLowerCase();
		this.symbol = symbol.toUpperCase();
		
		this.prevPrice = 0;
		this.prevType = "Buy";
		this.timeNormalize = new TimeNormalize(0);
		
		this.closed = true;
	}
	
	addTrade(symbolFrom, symbolTo, price, quantity, timestamp_sv, timestamp_cl, type) {
		if ( type === null ) {
			if ( price > this.prevPrice ) {
				type = "Buy";
			} else
			if ( price < this.prevPrice ) {
				type = "Sell";
			} else {
				type = this.prevType;
			}
			
			this.prevType = type;
			this.prevPrice = price;
		}
		
		switch(type){
			case "Sell":
				quantity = -Math.abs(quantity);
				break;
				
			case "Buy":
			default:
				quantity = Math.abs(quantity);
				break;
		}
		
		timestamp_sv = this.timeNormalize.normalize(timestamp_sv);
		if ( timestamp_sv === null ) {
			return;
		}
		
		this._addTrade(symbolFrom, symbolTo, price, quantity, timestamp_sv, timestamp_cl);
	}
	
	_addTrade(symbolFrom, symbolTo, price, quantity, timestamp_sv, timestamp_cl) {
		const symbol = `${symbolFrom}/${symbolTo}`;
		
		this.open();
		
		const trade = [price, quantity, timestamp_sv, timestamp_cl];
		const tradeGroup = [trade];
		this._emitSymbol("trade", symbol, tradeGroup);
		this._emitSymbol("trade-realtime", symbol, tradeGroup);
	}
	

	open() {
		if ( !this.closed ) {return;}
		this.closed = false;
		this._emit("open");
	}
	close() {
		if ( this.closed ) {return;}
		this.closed = true;
		this._emit("close");
	}

	_emit(event, ...args) {
		const info = {
			event, 
			exchange: this.exchange, 
			symbol: null
		};
		
		this.events.emit(`${info.event}:${info.exchange}`, info, ...args);
		this.events.emit(`${info.event}:*`, info, ...args);
		this.events.emit(`any`, info, ...args);
	}
	_emitSymbol(event, symbol, data) {
		const info = {
			event, 
			exchange: this.exchange, 
			symbol
		};

		this.events.emit(`${info.event}:${info.exchange}:${symbol}`, info, data);
		this.events.emit(`${info.event}:${info.exchange}:*`, info, data);
		this.events.emit(`${info.event}:*:*`, info, data);
		this.events.emit(`any`, info, data);
	}
}

class ExchangesRealtime extends EventEmitter {
	constructor(options) {
		super();
		
		this.options = {
			...options,
			
			exchanges: {
				...options.exchanges
			}
		};
		
		
		
		this.exchanges = {};
		
		const subs = [];
		for(let exchangeName in this.options.exchanges) {
			exchangeName = exchangeName.toLowerCase();
			//const exchange = this.constructor.exchanges[exchangeName];
			//assert(exchange, `Unk. exchange "${exchangeName}"`)
			
			const exchangeOptions = {
				trade: [],
				...this.options.exchanges[exchangeName]
			};
			
			for(let s of exchangeOptions.trade) {
				s = s.toUpperCase();
				const tmp = this._getCCCExchangeSymbolNameTrade(exchangeName, s);
				assert(tmp, "Exchange:symbol invlid(" + exchangeName+":"+s+")");
				subs.push(tmp);
				
				this.exchanges[`${exchangeName}:${s}`] = new ExchangeTrade(this, exchangeName, s);
			}
			
		}
		
		this.socket = new socketIOClient(STREAM_URL);
		this.socket.emit("SubAdd", {subs});
		
		this.socket.on("connect", () => {
		});
		this.socket.on("disconnect", () => {
			for(const key of Reflect.ownKeys(this.exchanges)) {
				this.exchanges[key].close();
			}
		});

		//["connect", "disconnect"].forEach(e => {this.socket.on(e, (...args) => console.log(e, args));});
		
		this.socket.on("m", (message) => {
			if ( typeof message === "string" &&
				( message.indexOf(CCC.STATIC.TYPE.TRADE + "~") === 0 ) ) {

				const obj = CCC.TRADE.unpackFast(message);
				if ( obj.Price !== null && obj.Quantity !== null && obj.TimeStamp !== null ) {
					this._parseTradeObject(obj);
				}
			}
		});
	}
	
	_parseTradeObject(obj) {
		const exchangeName = obj.ExchangeName.toLowerCase();
		const symbolName = `${obj.CurrencySymbolFrom}/${obj.CurrencySymbolTo}`;
		
		const esid = `${exchangeName}:${symbolName}`;
		
		const exchange = this.exchanges[esid];
		if ( exchange ) {
			exchange.addTrade(
				obj.CurrencySymbolFrom,
				obj.CurrencySymbolTo,
				obj.Price,
				obj.Quantity,
				obj.TimeStamp * 1e3,
				Date.now(),
				obj.Flag === CCC.TRADE.FLAGS.BUY ? "Buy" :
					(obj.Flag === CCC.TRADE.FLAGS.SELL ? "Sell" :
						null)
			);
		}
	}
	
	
	_getCCCExchangeSymbolNameTrade(exchange, symbol) {
		exchange = exchange.trim().toLowerCase();
		exchange = exchange[0].toUpperCase() + exchange.substr(1);
		
		symbol = symbol.trim().toUpperCase();
		const symbolParts = symbol.split("/");
		if ( symbolParts.length !== 2 ) {
			return null;
		}
		
		return [CCC.STATIC.TYPE.TRADE, exchange, ...symbolParts].join("~");
	}
	
	close() {
		this.socket.close();
	}
}
//ExchangesRealtime.exchanges = exchanges;



module.exports = ExchangesRealtime;
