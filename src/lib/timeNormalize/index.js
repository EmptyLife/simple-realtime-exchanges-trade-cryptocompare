
class TimeNormalize {
	constructor(skipCount = 2) {
		this.prevSvTime = null;
		this.prevClTime = null;
		
		this.skipCount = skipCount;
		this.createClTime = Date.now();//null;
	}

	normalize(svTime) {
		if ( this.createClTime === null ) {
			this.createClTime = Date.now();
		}

		if ( svTime < this.createClTime ) {
			return null;
		}
		
		if ( --this.skipCount >= 0 ) {
			return null;
		}
		
		const clTime = Date.now();
		
		if ( this.prevClTime === null ) {
			this.prevSvTime = svTime;
			this.prevClTime = clTime;
			return svTime;
		}
		
		const svDeltaTime = svTime - this.prevSvTime;
		if ( svDeltaTime >= 1e3 ) {
			this.prevClTime += Math.floor(svDeltaTime / 1e3) * 1e3;
			this.prevSvTime = svTime;
		}
		
		return svTime + clTime - this.prevClTime;
	}
}

module.exports = TimeNormalize;
