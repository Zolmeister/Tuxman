function startGame() {
	//helper functions
	window.requestAnimFrame = (function() {
		return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame ||
		function(/* function */callback, /* DOMElement */element) {
			window.setTimeout(callback, 1000 / 60);
		};
	})();
	Object.prototype.keys = function() {
		return Object.keys(this);
	}
	function loadImageAssets(assetList, assets, callback) {
		for (var i = 0; i < assetList.length; i++) {
			var assetInfo = assetList[i];
			var asset = new Image();
			asset.name = assetInfo.name;
			asset.callback = callback;
			asset.assets = assets;
			asset.assetList = assetList;
			asset.onload = function() {
				this.assets[this.name] = this;
				if (this.assetList.length === this.assets.keys().length) {
					this.callback();
				}
			}
			asset.src = assetInfo.file;
		}
	}

	function getElementPosition(element) {
		var elem = element, tagname = "", x = 0, y = 0;
		while (( typeof (elem) == "object") && ( typeof (elem.tagName) != "undefined")) {
			y += elem.offsetTop;
			x += elem.offsetLeft;
			tagname = elem.tagName.toUpperCase();

			if (tagname == "BODY")
				elem = 0;

			if ( typeof (elem) == "object") {
				if ( typeof (elem.offsetParent) == "object")
					elem = elem.offsetParent;
			}
		}
		return {
			x : x,
			y : y
		};
	}

	function drawRotatedImage(context, image, x, y, width, height, angle, flipV) {
		context.save();
		context.translate(x, y);
		context.rotate(angle);
		if (flipV) {
			context.scale(1, -1);
			context.drawImage(image, -(width / 2), -(height / 2), width, height);
		} else {
			context.drawImage(image, -(width / 2), -(height / 2), width, height);
		}
		context.restore();
	}

	function randLocEdge(x1, y1, x2, y2, width, height) {
		var side = Math.floor(Math.random() * 4);
		var randX = Math.floor(Math.random() * Math.abs(x1 - x2)) + Math.min(x1, x2);
		var randY = Math.floor(Math.random() * Math.abs(y1 - y2)) + Math.min(y1, y2);
		if (side === 0)//top
			return {
				x : randX,
				y : y1 - height
			};
		else if (side === 1)//right
			return {
				x : x2,
				y : randY
			};
		else if (side === 2)//bot
			return {
				x : randX,
				y : y2
			};
		else//left
			return {
				x : x1 - width,
				y : randY
			}
	}

	var clone = ( function() {
			return function(obj) {
				Clone.prototype = obj;
				return new Clone()
			};
			function Clone() {
			}

		}());
	//box2d defaults
	var b2Vec2 = Box2D.Common.Math.b2Vec2, b2BodyDef = Box2D.Dynamics.b2BodyDef, b2Body = Box2D.Dynamics.b2Body, b2FixtureDef = Box2D.Dynamics.b2FixtureDef, b2Fixture = Box2D.Dynamics.b2Fixture, b2World = Box2D.Dynamics.b2World, b2MassData = Box2D.Collision.Shapes.b2MassData, b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape, b2CircleShape = Box2D.Collision.Shapes.b2CircleShape, b2DebugDraw = Box2D.Dynamics.b2DebugDraw;

	//global keyboard
	var keyState = {};
	var arrowKeys = {
		38 : 'up',
		40 : 'down',
		37 : 'left',
		39 : 'right'
	};
	window.onkeydown = function(e) {
		try {
			keyState[arrowKeys[e.which] || String.fromCharCode(e.which)] = e.which;
		} catch(e) {
			console.log('error converting keypress to char code')
		}
	}
	window.onkeyup = function(e) {
		try {
			delete keyState[arrowKeys[e.which] || String.fromCharCode(e.which)];
		} catch(e) {
			console.log('error deleting keypress to char code')
		}
	}
	//game class
	var Game = function(canvasId) {
		this.debug = false;
		this.scrollSource = true;
		this.drawKills = true;
		this.clearObjects = true;
		this.sound = false;
		this.gunSound = new Audio('gunSound2.mp3');
		this.gunSound.volume = .5
		this.explosionSound = new Audio('explosion.mp3');
		this.explosionSound.volume = .7
		this.isPlayingSound = false;
		this.canvWidth = window.innerWidth;
		this.canvHeight = window.innerHeight;
		this.canvas = document.getElementById(canvasId) || document.getElementById('tuxman');
		this.canvas.width = this.canvWidth;
		this.canvas.height = this.canvHeight;
		this.canvas.scale = 1;
		this.ctx = this.canvas.getContext('2d');
		this.objectList = [];
		this.time = Date.now();
		this.assetList = [{
			'name' : 'tux',
			'file' : 'tux.png'
		}, {
			'name' : 'left gun',
			'file' : 'left_gun.png'
		}, {
			'name' : 'right gun',
			'file' : 'right_gun.png'
		}, {
			'name' : 'bullet',
			'file' : 'bullet.png'
		}, {
			'name' : 'winblows',
			'file' : 'winblows.png'
		}, {
			'name' : 'wound',
			'file' : 'wound.png'
		}];
		this.assets = {};
		this.mouseX = 0;
		this.mouseY = 0;
		this.mouseDown = false;
		this.deadBodies = [];
		this.died = false;
		this.kills = 0;
		this.world = new b2World(new b2Vec2(0, 0), false);
		//setup debug draw
		this.debugDraw = new b2DebugDraw();
		this.debugDraw.SetSprite(this.ctx);
		this.debugDraw.SetDrawScale(this.canvas.scale);
		this.debugDraw.SetFillAlpha(0.3);
		this.debugDraw.SetLineThickness(1.0);
		this.debugDraw.SetFlags(b2DebugDraw.e_shapeBit | b2DebugDraw.e_jointBit);

		if (this.debug)
			this.world.SetDebugDraw(this.debugDraw);

		//add event listeners
		this.canvas.canvasPosition = getElementPosition(this.canvas);
		this.canvas.game = this;
		this.canvas.onmousemove = function(e) {
			this.game.mouseX = (e.clientX - this.canvasPosition.x);
			this.game.mouseY = (e.clientY - this.canvasPosition.y)
		}
		this.canvas.onmousedown = function(e) {
			this.game.mouseDown = true;
		}
		this.canvas.onmouseup = function(e) {
			this.game.mouseDown = false;
		}
	}
	Game.prototype.contactListener = new Box2D.Dynamics.b2ContactListener;
	Game.prototype.contactListener.BeginContact = function(contact, manifold) {
		var fxA = contact.GetFixtureA();
		var fxB = contact.GetFixtureB();
		var nameA = fxA.GetBody().GetUserData().name;
		var nameB = fxB.GetBody().GetUserData().name;
		if (nameA === 'Bullet' && nameB === 'Enemy' || nameA === 'Enemy' && nameB === 'Bullet') {
			fxA.GetBody().GetUserData().damage();
			fxB.GetBody().GetUserData().damage();
		} else if (nameA === 'Enemy' && nameB === 'Player' || nameA === 'Player' && nameB === 'Enemy') {
			var enemy = (nameA === 'Enemy') ? fxA.GetBody().GetUserData() : fxB.GetBody().GetUserData();
			var player = (nameA === 'Player') ? fxA.GetBody().GetUserData() : fxB.GetBody().GetUserData();
			enemy.game.deadBodies.push(enemy);
			if (!player.isDead) {
				document.body.id = 'dead';
				player.isDead = true;

				player.game.scrollSource = false;
				player.game.drawKills = false;
				player.game.clearObjects = false;

				if (player.game.sound)
					player.game.explosionSound.play();
			}
		}
	};
	Game.prototype.addWound = function(obj) {
		var img = obj.img;
		var tempCanvas = document.createElement('canvas');
		tempCanvas.width = img.width;
		tempCanvas.height = img.height;
		var ctx = tempCanvas.getContext('2d');
		ctx.drawImage(img, 0, 0);
		ctx.drawImage(this.assets['wound'], Math.floor(Math.random() * (tempCanvas.width / 2)) + tempCanvas.width / 4, Math.floor(Math.random() * (tempCanvas.height - tempCanvas.height / 2)) + tempCanvas.height / 4);
		var image = new Image();
		image.src = tempCanvas.toDataURL("image/png");
		image.target = obj;
		image.onload = function() {
			this.target.img = this;
		}
	}
	var GameGlobalObject = function() {
	}
	var Bullet = function(gun, x, y, angle) {
		this.game = GameGlobalObject.game;
		this.name = 'Bullet';
		this.gun = gun;
		this.x = x;
		this.y = y;
		this.speed = .5;
		this.angle = angle || 0;
		this.img = this.game.assets['bullet'] || new Image();
		this.width = this.img.width * this.gun.player.scale;
		this.height = this.img.height * this.gun.player.scale;
		this.fixDef = new b2FixtureDef;
		this.fixDef.density = 1.0;
		this.fixDef.friction = 0;
		this.fixDef.restitution = 1;
		this.fixDef.shape = new b2PolygonShape;
		this.fixDef.shape.SetAsBox(this.width, this.height);
		this.fixDef.filter.groupIndex = -1;
		this.bodyDef = new b2BodyDef;
		this.bodyDef.type = b2Body.b2_dynamicBody;
		this.bodyDef.userData = this;
		this.bodyDef.position.Set(this.x, this.y);
		this.body = this.game.world.CreateBody(this.bodyDef);
		this.body.SetAngle(this.angle);
		this.fixture = this.body.CreateFixture(this.fixDef);
		this.isDead = false;
	}
	Bullet.prototype.update = function(timeDelta) {//FIX-ME: use bod2d native vector movement
		var deltaX = Math.cos(this.angle) * this.speed * timeDelta;
		var deltaY = Math.sin(this.angle) * this.speed * timeDelta;
		this.x += deltaX;
		this.y += deltaY
		this.body.SetPosition({
			x : this.x,
			y : this.y
		});
		if (this.x < 0 || this.x > this.game.canvas.width || this.y < 0 || this.y > this.game.canvas.height)
			this.game.deadBodies.push(this);
	}
	Bullet.prototype.clear = function() {
		this.maxSide = Math.sqrt(Math.pow(this.width, 2) + Math.pow(this.height, 2));
		this.gun.player.ctx.clearRect(this.x - this.maxSide, this.y - this.maxSide, this.maxSide * 2, this.maxSide * 2);
	}
	Bullet.prototype.draw = function() {
		drawRotatedImage(this.gun.player.ctx, this.img, this.x, this.y, this.width * 2, this.height * 2, this.angle, false);
	}
	Bullet.prototype.suicide = function() {
		this.isDead = true;
		this.game.world.DestroyBody(this.body)
	}
	Bullet.prototype.damage = function() {
		this.game.deadBodies.push(this);
	}
	var Gun = function(player, x, y, image, flipImage, angle) {
		this.game = GameGlobalObject.game;
		this.name = 'Gun';
		this.player = player;
		this.relX = x;
		this.relY = y;
		this.x = this.player.x + this.relX;
		this.y = this.player.y + this.relY;
		this.img = image || new Image();
		this.width = image.width * this.player.scale;
		this.height = image.height * this.player.scale;
		this.fixDef = new b2FixtureDef;
		this.fixDef.density = 1.0;
		this.fixDef.friction = 0;
		this.fixDef.restitution = 1;
		this.fixDef.shape = new b2PolygonShape;
		this.fixDef.shape.SetAsBox(this.width, this.height);
		this.fixDef.filter.groupIndex = -1;
		this.bodyDef = new b2BodyDef;
		this.bodyDef.type = b2Body.b2_kinematicBody;
		this.bodyDef.userData = this;
		this.bodyDef.position.Set(this.x, this.y);
		this.body = this.game.world.CreateBody(this.bodyDef);
		this.fixture = this.body.CreateFixture(this.fixDef);
		this.angle = angle || 0;
		this.flipImageVirt = false;
		this.flipLeft = flipImage || false;
		this.bullets = [];
		this.shotTimeDelta = 0;
		this.rate = 100;
	}
	Gun.prototype.update = function(timeDelta) {//FIX-ME: use bod2d native vector movement
		this.x = this.player.x + this.relX;
		this.y = this.player.y + this.relY;
		var deltaX = this.game.mouseX - this.x;
		var deltaY = this.game.mouseY - this.y
		this.angle = Math.atan2(deltaY, deltaX);
		this.body.SetAngle(this.angle);
		if (!this.flipLeft && (this.angle < -1 * Math.PI / 2 || this.angle > Math.PI / 2)) {
			this.flipImageVirt = true;
		} else if (this.flipLeft && (this.angle > -1 * Math.PI / 2 && this.angle < Math.PI / 2)) {
			this.flipImageVirt = true;
		} else {
			this.flipImageVirt = false;
		}
		if (this.flipLeft) {
			this.angle += Math.PI;
		}
		this.body.SetPosition({
			x : this.x,
			y : this.y
		});
		this.shotTimeDelta += timeDelta;
		if (this.game.mouseDown && this.shotTimeDelta > this.rate) {//shoot
			var angle = this.angle
			if (this.flipLeft)
				angle += Math.PI;
			var dX = Math.cos(angle) * this.width;
			var dY = Math.sin(angle) * this.height;
			var x = dX + this.x;
			var y = dY + this.y - 5;
			this.bullets.push(new Bullet(this, x, y, angle));
			this.shotTimeDelta = 0;

			//sound
			if (this.game.sound) {
				if (this.game.gunSound.currentTime > .15 || this.game.gunSound.currentTime === 0) {
					this.game.isPlayingSound = true;
					this.game.gunSound.currentTime = 0;
					this.game.gunSound.play();
				}
			}

		}
		for (var i = 0; i < this.bullets.length; i++) {
			this.bullets[i].update(timeDelta);
		}
	}
	Gun.prototype.clear = function() {
		//clear sprite
		this.maxSide = Math.sqrt(Math.pow(this.width, 2) + Math.pow(this.height, 2));
		this.player.ctx.clearRect(this.x - this.maxSide, this.y - this.maxSide, this.maxSide * 2, this.maxSide * 2);

		//clear bullets
		for (var i = this.bullets.length - 1; i >= 0; i--) {
			this.bullets[i].clear();
			if (this.bullets[i].isDead)
				this.bullets.splice(i, 1);
		}
	}
	Gun.prototype.draw = function() {
		drawRotatedImage(this.player.ctx, this.img, this.x, this.y, this.width * 2, this.height * 2, this.angle, this.flipImageVirt);
		for (var i = this.bullets.length - 1; i >= 0; i--) {
			if (this.bullets[i].isDead)
				this.bullets.splice(i, 1);
			else
				this.bullets[i].draw();
		}
	}
	var Player = function(x, y, scale, width, height, xCtx) {
		this.game = GameGlobalObject.game;
		this.name = 'Player';
		this.x = x || 100;
		this.y = y || 100;
		this.speed = .2;
		this.scale = scale || 1
		this.width = width || this.game.assets['tux'].width * this.scale;
		this.height = height || this.game.assets['tux'].height * this.scale;
		this.fixDef = new b2FixtureDef;
		this.fixDef.density = 1.0;
		this.fixDef.friction = 0;
		this.fixDef.restitution = 1;
		this.fixDef.shape = new b2PolygonShape;
		this.fixDef.shape.SetAsBox(this.width, this.height);
		this.fixDef.filter.groupIndex = -1;
		this.bodyDef = new b2BodyDef;
		this.bodyDef.type = b2Body.b2_kinematicBody;
		this.bodyDef.userData = this;
		this.bodyDef.position.Set(this.x, this.y);
		this.body = this.game.world.CreateBody(this.bodyDef);
		this.fixture = this.body.CreateFixture(this.fixDef);
		this.ctx = xCtx || this.game.ctx;
		this.img = this.game.assets['tux'] || new Image();
		this.guns = [];
		this.isDead = false;
	}
	Player.prototype.update = function(timeDelta) {//FIX-ME: use bod2d native vector movement
		//update position
		var deltaX = 0;
		var deltaY = 0;
		if (keyState['up'] || keyState['W']) {
			deltaY -= this.speed * timeDelta;
		} else if (keyState['down'] || keyState['S']) {
			deltaY += this.speed * timeDelta;
		}
		if (keyState['left'] || keyState['A']) {
			deltaX -= this.speed * timeDelta;
		} else if (keyState['right'] || keyState['D']) {
			deltaX += this.speed * timeDelta;
		}
		this.angle = Math.atan2(deltaY, deltaX)
		var dX = Math.cos(this.angle) * this.speed;
		var dY = Math.sin(this.angle) * this.speed;
		if (deltaX !== 0)
			this.x += dX * timeDelta;
		if (deltaY !== 0)
			this.y += dY * timeDelta
		this.body.SetPosition({
			x : this.x,
			y : this.y
		})
		//update gun sprites
		for (var i = 0; i < this.guns.length; i++) {
			this.guns[i].update(timeDelta);
		}
	}
	Player.prototype.clear = function() {
		//clear sprite
		this.maxSide = Math.sqrt(Math.pow(this.width, 2) + Math.pow(this.height, 2));
		this.ctx.clearRect(this.x - this.maxSide, this.y - this.maxSide, this.maxSide * 2, this.maxSide * 2);

		//clear gun sprites
		for (var i = 0; i < this.guns.length; i++) {
			this.guns[i].clear();
		}
	}
	Player.prototype.draw = function() {
		//draw sprite
		this.ctx.drawImage(this.img, this.x - this.width, this.y - this.height, this.width * 2, this.height * 2);

		//draw gun sprites
		for (var i = 0; i < this.guns.length; i++) {
			this.guns[i].draw();
		}
	}
	var Enemy = function(spawn, x, y, scale, width, height, health) {
		this.game = GameGlobalObject.game;
		this.name = 'Enemy';
		this.spawn = spawn;
		this.x = x || 100;
		this.y = y || 100;
		this.speed = .15;
		this.scale = scale || 1;
		this.width = width || this.game.assets['winblows'].width * this.scale;
		this.height = height || this.game.assets['winblows'].height * this.scale;
		this.fixDef = new b2FixtureDef;
		this.fixDef.density = 1.0;
		this.fixDef.friction = 0;
		this.fixDef.restitution = 1;
		this.fixDef.shape = new b2PolygonShape;
		this.fixDef.shape.SetAsBox(this.width, this.height);
		this.bodyDef = new b2BodyDef;
		this.bodyDef.type = b2Body.b2_dynamicBody;
		this.bodyDef.userData = this;
		this.bodyDef.position.Set(this.x, this.y);
		this.body = this.game.world.CreateBody(this.bodyDef);
		this.fixture = this.body.CreateFixture(this.fixDef);
		this.img = this.game.assets['winblows'] || new Image();
		this.angle = 0;
		this.isDead = false;
		this.health = health || 10;
		this.hits = 0;
	}
	Enemy.prototype.clear = function() {
		this.maxSide = Math.sqrt(Math.pow(this.width, 2) + Math.pow(this.height, 2));
		this.spawn.ctx.clearRect(this.x - this.maxSide, this.y - this.maxSide, this.maxSide * 2, this.maxSide * 2);
	}
	Enemy.prototype.update = function(timeDelta) {//FIX-ME: use bod2d native vector movement
		var deltaX = this.spawn.target.x - this.x;
		var deltaY = this.spawn.target.y - this.y;
		this.angle = Math.atan2(deltaY, deltaX);
		this.body.SetAngle(this.angle);

		var dX = Math.cos(this.angle) * this.speed * timeDelta;
		var dY = Math.sin(this.angle) * this.speed * timeDelta;
		this.x += dX;
		this.y += dY;
		this.body.SetPosition({
			x : this.x,
			y : this.y
		})
	}
	Enemy.prototype.draw = function() {
		var flipV = this.angle > Math.PI / 2 || this.angle < -1 * Math.PI / 2;
		drawRotatedImage(this.spawn.ctx, this.img, this.x, this.y, this.width * 2, this.height * 2, this.angle, flipV);
	}
	Enemy.prototype.suicide = function() {
		this.isDead = true;
		this.game.world.DestroyBody(this.body);
	}

	Enemy.prototype.damage = function() {
		this.health -= 1;
		this.hits += 1;
		if (this.health === 0) {
			this.game.kills += 1;
			this.game.deadBodies.push(this);
		}
		this.game.addWound(this);
	}
	var EnemySpawn = function(target, xCtx) {
		this.game = GameGlobalObject.game;
		this.name = 'EnemySpawn';
		this.enemies = [];
		this.ctx = xCtx || this.game.ctx;
		this.spawnTimeDelta = 0;
		this.rate = 1500;
		this.target = target;
		this.scale = .15;
		this.enemyWidth = this.game.assets['winblows'].width * this.scale;
		this.enemyHeight = this.game.assets['winblows'].height * this.scale;
		this.enemyHealth = 7;
		this.enemyMaxHealth = 22;
		this.upgradeTime = 5000;
		this.upgradeTimeDelta = 0;
	}
	EnemySpawn.prototype.clear = function() {
		for (var i = this.enemies.length - 1; i >= 0; i--) {
			this.enemies[i].clear();
			if (this.enemies[i].isDead)
				this.enemies.splice(i, 1);
		}
	}
	EnemySpawn.prototype.update = function(timeDelta) {
		this.spawnTimeDelta += timeDelta;
		this.upgradeTimeDelta += timeDelta;
		if (this.upgradeTimeDelta >= this.upgradeTime) {
			this.enemyHealth += 1;
			if (this.enemyHealth > this.enemyMaxHealth)
				this.enemyHealth = this.enemyMaxHealth;
			this.upgradeTimeDelta = 0;
		}
		if (this.spawnTimeDelta >= this.rate) {//spawn
			var loc = randLocEdge(0, 0, this.game.canvas.width, this.game.canvas.height, this.enemyWidth, this.enemyHeight);
			var enemy = new Enemy(this, loc.x, loc.y, this.scale, this.enemyWidth, this.enemyHeight, this.enemyHealth);
			this.enemies.push(enemy);
			this.spawnTimeDelta = 0;
		}
		for (var i = this.enemies.length - 1; i >= 0; i--) {
			if (this.enemies[i].isDead)
				this.enemies.splice(i, 1);
			else
				this.enemies[i].update(timeDelta);
		}
	}
	EnemySpawn.prototype.draw = function() {
		for (var i = 0; i < this.enemies.length; i++) {
			this.enemies[i].draw();
		}
	}
	Game.prototype.clearTheDead = function() {
		for (var i = 0; i < this.deadBodies.length; i++) {
			this.deadBodies[i].suicide();
		}
		this.deadBodies = [];
	}

	Game.prototype.update = function(timeUpdate) {
		var timeDelta = timeUpdate - this.time;

		this.time = timeUpdate;
		this.clearTheDead();
		this.world.Step(1 / 60//frame-rate
		, 10//velocity iterations
		, 10 //position iterations
		);
		if (this.debug) {
			this.world.DrawDebugData();
		}

		this.world.ClearForces();
		//clear kills
		if (this.drawKills) {
			this.ctx.clearRect(this.canvas.width / 2, 10, 200, 30);

		}

		for (var i = 0; i < this.objectList.length; i++) {
			if (this.clearObjects)
				this.objectList[i].clear();
			this.objectList[i].update(timeDelta);
		}
		for (var i = 0; i < this.objectList.length; i++) {
			this.objectList[i].draw();
		}
		if (this.drawKills) {
			this.ctx.font = '15pt monospace'
			this.ctx.fillText("Kills: " + this.kills, this.canvas.width / 2, 40);
		}
		if (this.scrollSource)
			scrollSource(timeDelta);

	};

	(function init() {
		var game = new Game();
		GameGlobalObject.game = game
		game.world.SetContactListener(game.contactListener);
		loadImageAssets(game.assetList, game.assets, function() {
			var p1 = new Player(400, 400, .25);
			p1.guns.push(new Gun(p1, -45, 10, game.assets['left gun'], true));
			p1.guns.push(new Gun(p1, 45, 10, game.assets['right gun']));
			var enemySpawn = new EnemySpawn(p1);
			game.objectList.push(p1);
			game.objectList.push(enemySpawn);

			update = function(timeDelta) {
				if (isNaN(timeDelta)) {
					requestAnimFrame(update);
					return;
				}
				game.update(timeDelta)
				requestAnimFrame(update);
			}
			update();
			//link buttons
			document.getElementById('resetButton').style.display = 'block';
			document.getElementById('soundButton').style.display = 'block';
			document.getElementById('resetButton').onclick = function() {
				game.objectList = [];
				document.body.id = '';
				game.drawKills = true;
				game.clearObjects = true;
				game.sound = false;
				game.kills = 0;
				game.scrollSource = true;
				game.canvas.width = game.canvas.width;
				var p1 = new Player(400, 400, .25);
				p1.guns.push(new Gun(p1, -45, 10, game.assets['left gun'], true));
				p1.guns.push(new Gun(p1, 45, 10, game.assets['right gun']));
				var enemySpawn = new EnemySpawn(p1);
				game.objectList.push(p1);
				game.objectList.push(enemySpawn);
			}
			document.getElementById('soundButton').onclick = function() {
				game.sound = !game.sound;
				if (game.sound)
					document.getElementById('soundButton').innerHTML = 'sound: on';
				else
					document.getElementById('soundButton').innerHTML = 'sound: off';
			}
		})
	})();

}

var sourceLetter = 0;
var sourceLine = 0;
var sourceText = "";
var sourceDelta = 0;
var sourceRate = 100;
var sourceOut = document.getElementById('sourceOut');
function loadSourceText() {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = function() {
		if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
			sourceText = xmlhttp.responseText.split('\n');
		}
	}
	xmlhttp.open("GET", "main.js", false);
	xmlhttp.send();
}

loadSourceText();
function scrollSource(timeDelta) {
	sourceDelta += timeDelta;
	if (sourceDelta >= sourceRate && sourceText[sourceLine]) {
		sourceOut.innerHTML += sourceText[sourceLine][sourceLetter];
		sourceLetter += 1;
		if (sourceLetter >= sourceText[sourceLine].length) {
			sourceLine += 1;
			sourceLetter = 0;
			sourceOut.innerHTML += "<br>";
		}
		if (sourceLine >= sourceText.length)
			sourceLine = 0;
		sourceDelta = 0;
		sourceOut.scrollTop = sourceOut.scrollHeight;
	}
}

//Mousetrap.bind('up up down down left right left right b a enter', function() {
	startGame();
//});
