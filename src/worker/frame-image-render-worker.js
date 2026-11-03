//#region node_modules/tslib/tslib.es6.mjs
var e = function(t, n) {
	return e = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(e, t) {
		e.__proto__ = t;
	} || function(e, t) {
		for (var n in t) Object.prototype.hasOwnProperty.call(t, n) && (e[n] = t[n]);
	}, e(t, n);
};
function t(t, n) {
	if (typeof n != "function" && n !== null) throw TypeError("Class extends value " + String(n) + " is not a constructor or null");
	e(t, n);
	function r() {
		this.constructor = t;
	}
	t.prototype = n === null ? Object.create(n) : (r.prototype = n.prototype, new r());
}
function n(e, t, n, r) {
	function i(e) {
		return e instanceof n ? e : new n(function(t) {
			t(e);
		});
	}
	return new (n ||= Promise)(function(n, a) {
		function o(e) {
			try {
				c(r.next(e));
			} catch (e) {
				a(e);
			}
		}
		function s(e) {
			try {
				c(r.throw(e));
			} catch (e) {
				a(e);
			}
		}
		function c(e) {
			e.done ? n(e.value) : i(e.value).then(o, s);
		}
		c((r = r.apply(e, t || [])).next());
	});
}
function r(e, t) {
	var n = {
		label: 0,
		sent: function() {
			if (a[0] & 1) throw a[1];
			return a[1];
		},
		trys: [],
		ops: []
	}, r, i, a, o = Object.create((typeof Iterator == "function" ? Iterator : Object).prototype);
	return o.next = s(0), o.throw = s(1), o.return = s(2), typeof Symbol == "function" && (o[Symbol.iterator] = function() {
		return this;
	}), o;
	function s(e) {
		return function(t) {
			return c([e, t]);
		};
	}
	function c(s) {
		if (r) throw TypeError("Generator is already executing.");
		for (; o && (o = 0, s[0] && (n = 0)), n;) try {
			if (r = 1, i && (a = s[0] & 2 ? i.return : s[0] ? i.throw || ((a = i.return) && a.call(i), 0) : i.next) && !(a = a.call(i, s[1])).done) return a;
			switch (i = 0, a && (s = [s[0] & 2, a.value]), s[0]) {
				case 0:
				case 1:
					a = s;
					break;
				case 4: return n.label++, {
					value: s[1],
					done: !1
				};
				case 5:
					n.label++, i = s[1], s = [0];
					continue;
				case 7:
					s = n.ops.pop(), n.trys.pop();
					continue;
				default:
					if ((a = n.trys, !(a = a.length > 0 && a[a.length - 1])) && (s[0] === 6 || s[0] === 2)) {
						n = 0;
						continue;
					}
					if (s[0] === 3 && (!a || s[1] > a[0] && s[1] < a[3])) {
						n.label = s[1];
						break;
					}
					if (s[0] === 6 && n.label < a[1]) {
						n.label = a[1], a = s;
						break;
					}
					if (a && n.label < a[2]) {
						n.label = a[2], n.ops.push(s);
						break;
					}
					a[2] && n.ops.pop(), n.trys.pop();
					continue;
			}
			s = t.call(e, n);
		} catch (e) {
			s = [6, e], i = 0;
		} finally {
			r = a = 0;
		}
		if (s[0] & 5) throw s[1];
		return {
			value: s[0] ? s[1] : void 0,
			done: !0
		};
	}
}
function i(e) {
	var t = typeof Symbol == "function" && Symbol.iterator, n = t && e[t], r = 0;
	if (n) return n.call(e);
	if (e && typeof e.length == "number") return { next: function() {
		return e && r >= e.length && (e = void 0), {
			value: e && e[r++],
			done: !e
		};
	} };
	throw TypeError(t ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function a(e, t) {
	var n = typeof Symbol == "function" && e[Symbol.iterator];
	if (!n) return e;
	var r = n.call(e), i, a = [], o;
	try {
		for (; (t === void 0 || t-- > 0) && !(i = r.next()).done;) a.push(i.value);
	} catch (e) {
		o = { error: e };
	} finally {
		try {
			i && !i.done && (n = r.return) && n.call(r);
		} finally {
			if (o) throw o.error;
		}
	}
	return a;
}
function o(e, t, n) {
	if (n || arguments.length === 2) for (var r = 0, i = t.length, a; r < i; r++) (a || !(r in t)) && (a ||= Array.prototype.slice.call(t, 0, r), a[r] = t[r]);
	return e.concat(a || Array.prototype.slice.call(t));
}
function s(e) {
	return this instanceof s ? (this.v = e, this) : new s(e);
}
function c(e, t, n) {
	if (!Symbol.asyncIterator) throw TypeError("Symbol.asyncIterator is not defined.");
	var r = n.apply(e, t || []), i, a = [];
	return i = Object.create((typeof AsyncIterator == "function" ? AsyncIterator : Object).prototype), c("next"), c("throw"), c("return", o), i[Symbol.asyncIterator] = function() {
		return this;
	}, i;
	function o(e) {
		return function(t) {
			return Promise.resolve(t).then(e, f);
		};
	}
	function c(e, t) {
		r[e] && (i[e] = function(t) {
			return new Promise(function(n, r) {
				a.push([
					e,
					t,
					n,
					r
				]) > 1 || l(e, t);
			});
		}, t && (i[e] = t(i[e])));
	}
	function l(e, t) {
		try {
			u(r[e](t));
		} catch (e) {
			p(a[0][3], e);
		}
	}
	function u(e) {
		e.value instanceof s ? Promise.resolve(e.value.v).then(d, f) : p(a[0][2], e);
	}
	function d(e) {
		l("next", e);
	}
	function f(e) {
		l("throw", e);
	}
	function p(e, t) {
		e(t), a.shift(), a.length && l(a[0][0], a[0][1]);
	}
}
function l(e) {
	if (!Symbol.asyncIterator) throw TypeError("Symbol.asyncIterator is not defined.");
	var t = e[Symbol.asyncIterator], n;
	return t ? t.call(e) : (e = typeof i == "function" ? i(e) : e[Symbol.iterator](), n = {}, r("next"), r("throw"), r("return"), n[Symbol.asyncIterator] = function() {
		return this;
	}, n);
	function r(t) {
		n[t] = e[t] && function(n) {
			return new Promise(function(r, i) {
				n = e[t](n), a(r, i, n.done, n.value);
			});
		};
	}
	function a(e, t, n, r) {
		Promise.resolve(r).then(function(t) {
			e({
				value: t,
				done: n
			});
		}, t);
	}
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/isFunction.js
function u(e) {
	return typeof e == "function";
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/createErrorClass.js
function d(e) {
	var t = e(function(e) {
		Error.call(e), e.stack = (/* @__PURE__ */ Error()).stack;
	});
	return t.prototype = Object.create(Error.prototype), t.prototype.constructor = t, t;
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/UnsubscriptionError.js
var f = d(function(e) {
	return function(t) {
		e(this), this.message = t ? t.length + " errors occurred during unsubscription:\n" + t.map(function(e, t) {
			return t + 1 + ") " + e.toString();
		}).join("\n  ") : "", this.name = "UnsubscriptionError", this.errors = t;
	};
});
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/arrRemove.js
function p(e, t) {
	if (e) {
		var n = e.indexOf(t);
		0 <= n && e.splice(n, 1);
	}
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/Subscription.js
var m = function() {
	function e(e) {
		this.initialTeardown = e, this.closed = !1, this._parentage = null, this._finalizers = null;
	}
	return e.prototype.unsubscribe = function() {
		var e, t, n, r, s;
		if (!this.closed) {
			this.closed = !0;
			var c = this._parentage;
			if (c) if (this._parentage = null, Array.isArray(c)) try {
				for (var l = i(c), d = l.next(); !d.done; d = l.next()) d.value.remove(this);
			} catch (t) {
				e = { error: t };
			} finally {
				try {
					d && !d.done && (t = l.return) && t.call(l);
				} finally {
					if (e) throw e.error;
				}
			}
			else c.remove(this);
			var p = this.initialTeardown;
			if (u(p)) try {
				p();
			} catch (e) {
				s = e instanceof f ? e.errors : [e];
			}
			var m = this._finalizers;
			if (m) {
				this._finalizers = null;
				try {
					for (var h = i(m), g = h.next(); !g.done; g = h.next()) {
						var v = g.value;
						try {
							_(v);
						} catch (e) {
							s ??= [], e instanceof f ? s = o(o([], a(s)), a(e.errors)) : s.push(e);
						}
					}
				} catch (e) {
					n = { error: e };
				} finally {
					try {
						g && !g.done && (r = h.return) && r.call(h);
					} finally {
						if (n) throw n.error;
					}
				}
			}
			if (s) throw new f(s);
		}
	}, e.prototype.add = function(t) {
		if (t && t !== this) if (this.closed) _(t);
		else {
			if (t instanceof e) {
				if (t.closed || t._hasParent(this)) return;
				t._addParent(this);
			}
			(this._finalizers = this._finalizers ?? []).push(t);
		}
	}, e.prototype._hasParent = function(e) {
		var t = this._parentage;
		return t === e || Array.isArray(t) && t.includes(e);
	}, e.prototype._addParent = function(e) {
		var t = this._parentage;
		this._parentage = Array.isArray(t) ? (t.push(e), t) : t ? [t, e] : e;
	}, e.prototype._removeParent = function(e) {
		var t = this._parentage;
		t === e ? this._parentage = null : Array.isArray(t) && p(t, e);
	}, e.prototype.remove = function(t) {
		var n = this._finalizers;
		n && p(n, t), t instanceof e && t._removeParent(this);
	}, e.EMPTY = (function() {
		var t = new e();
		return t.closed = !0, t;
	})(), e;
}(), h = m.EMPTY;
function g(e) {
	return e instanceof m || e && "closed" in e && u(e.remove) && u(e.add) && u(e.unsubscribe);
}
function _(e) {
	u(e) ? e() : e.unsubscribe();
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/config.js
var v = {
	onUnhandledError: null,
	onStoppedNotification: null,
	Promise: void 0,
	useDeprecatedSynchronousErrorHandling: !1,
	useDeprecatedNextContext: !1
}, y = {
	setTimeout: function(e, t) {
		var n = [...arguments].slice(2), r = y.delegate;
		return r?.setTimeout ? r.setTimeout.apply(r, o([e, t], a(n))) : setTimeout.apply(void 0, o([e, t], a(n)));
	},
	clearTimeout: function(e) {
		return (y.delegate?.clearTimeout || clearTimeout)(e);
	},
	delegate: void 0
};
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/reportUnhandledError.js
function b(e) {
	y.setTimeout(function() {
		var t = v.onUnhandledError;
		if (t) t(e);
		else throw e;
	});
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/noop.js
function x() {}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/NotificationFactories.js
var ee = (function() {
	return S("C", void 0, void 0);
})();
function te(e) {
	return S("E", void 0, e);
}
function ne(e) {
	return S("N", e, void 0);
}
function S(e, t, n) {
	return {
		kind: e,
		value: t,
		error: n
	};
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/errorContext.js
var C = null;
function w(e) {
	if (v.useDeprecatedSynchronousErrorHandling) {
		var t = !C;
		if (t && (C = {
			errorThrown: !1,
			error: null
		}), e(), t) {
			var n = C, r = n.errorThrown, i = n.error;
			if (C = null, r) throw i;
		}
	} else e();
}
function re(e) {
	v.useDeprecatedSynchronousErrorHandling && C && (C.errorThrown = !0, C.error = e);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/Subscriber.js
var T = function(e) {
	t(n, e);
	function n(t) {
		var n = e.call(this) || this;
		return n.isStopped = !1, t ? (n.destination = t, g(t) && t.add(n)) : n.destination = se, n;
	}
	return n.create = function(e, t, n) {
		return new D(e, t, n);
	}, n.prototype.next = function(e) {
		this.isStopped ? k(ne(e), this) : this._next(e);
	}, n.prototype.error = function(e) {
		this.isStopped ? k(te(e), this) : (this.isStopped = !0, this._error(e));
	}, n.prototype.complete = function() {
		this.isStopped ? k(ee, this) : (this.isStopped = !0, this._complete());
	}, n.prototype.unsubscribe = function() {
		this.closed || (this.isStopped = !0, e.prototype.unsubscribe.call(this), this.destination = null);
	}, n.prototype._next = function(e) {
		this.destination.next(e);
	}, n.prototype._error = function(e) {
		try {
			this.destination.error(e);
		} finally {
			this.unsubscribe();
		}
	}, n.prototype._complete = function() {
		try {
			this.destination.complete();
		} finally {
			this.unsubscribe();
		}
	}, n;
}(m), ie = Function.prototype.bind;
function E(e, t) {
	return ie.call(e, t);
}
var ae = function() {
	function e(e) {
		this.partialObserver = e;
	}
	return e.prototype.next = function(e) {
		var t = this.partialObserver;
		if (t.next) try {
			t.next(e);
		} catch (e) {
			O(e);
		}
	}, e.prototype.error = function(e) {
		var t = this.partialObserver;
		if (t.error) try {
			t.error(e);
		} catch (e) {
			O(e);
		}
		else O(e);
	}, e.prototype.complete = function() {
		var e = this.partialObserver;
		if (e.complete) try {
			e.complete();
		} catch (e) {
			O(e);
		}
	}, e;
}(), D = function(e) {
	t(n, e);
	function n(t, n, r) {
		var i = e.call(this) || this, a;
		if (u(t) || !t) a = {
			next: t ?? void 0,
			error: n ?? void 0,
			complete: r ?? void 0
		};
		else {
			var o;
			i && v.useDeprecatedNextContext ? (o = Object.create(t), o.unsubscribe = function() {
				return i.unsubscribe();
			}, a = {
				next: t.next && E(t.next, o),
				error: t.error && E(t.error, o),
				complete: t.complete && E(t.complete, o)
			}) : a = t;
		}
		return i.destination = new ae(a), i;
	}
	return n;
}(T);
function O(e) {
	v.useDeprecatedSynchronousErrorHandling ? re(e) : b(e);
}
function oe(e) {
	throw e;
}
function k(e, t) {
	var n = v.onStoppedNotification;
	n && y.setTimeout(function() {
		return n(e, t);
	});
}
var se = {
	closed: !0,
	next: x,
	error: oe,
	complete: x
}, A = (function() {
	return typeof Symbol == "function" && Symbol.observable || "@@observable";
})();
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/identity.js
function j(e) {
	return e;
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/pipe.js
function ce(e) {
	return e.length === 0 ? j : e.length === 1 ? e[0] : function(t) {
		return e.reduce(function(e, t) {
			return t(e);
		}, t);
	};
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/Observable.js
var M = function() {
	function e(e) {
		e && (this._subscribe = e);
	}
	return e.prototype.lift = function(t) {
		var n = new e();
		return n.source = this, n.operator = t, n;
	}, e.prototype.subscribe = function(e, t, n) {
		var r = this, i = ue(e) ? e : new D(e, t, n);
		return w(function() {
			var e = r, t = e.operator, n = e.source;
			i.add(t ? t.call(i, n) : n ? r._subscribe(i) : r._trySubscribe(i));
		}), i;
	}, e.prototype._trySubscribe = function(e) {
		try {
			return this._subscribe(e);
		} catch (t) {
			e.error(t);
		}
	}, e.prototype.forEach = function(e, t) {
		var n = this;
		return t = N(t), new t(function(t, r) {
			var i = new D({
				next: function(t) {
					try {
						e(t);
					} catch (e) {
						r(e), i.unsubscribe();
					}
				},
				error: r,
				complete: t
			});
			n.subscribe(i);
		});
	}, e.prototype._subscribe = function(e) {
		return this.source?.subscribe(e);
	}, e.prototype[A] = function() {
		return this;
	}, e.prototype.pipe = function() {
		return ce([...arguments])(this);
	}, e.prototype.toPromise = function(e) {
		var t = this;
		return e = N(e), new e(function(e, n) {
			var r;
			t.subscribe(function(e) {
				return r = e;
			}, function(e) {
				return n(e);
			}, function() {
				return e(r);
			});
		});
	}, e.create = function(t) {
		return new e(t);
	}, e;
}();
function N(e) {
	return e ?? v.Promise ?? Promise;
}
function le(e) {
	return e && u(e.next) && u(e.error) && u(e.complete);
}
function ue(e) {
	return e && e instanceof T || le(e) && g(e);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/lift.js
function de(e) {
	return u(e?.lift);
}
function P(e) {
	return function(t) {
		if (de(t)) return t.lift(function(t) {
			try {
				return e(t, this);
			} catch (e) {
				this.error(e);
			}
		});
		throw TypeError("Unable to lift unknown Observable type");
	};
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/operators/OperatorSubscriber.js
function F(e, t, n, r, i) {
	return new fe(e, t, n, r, i);
}
var fe = function(e) {
	t(n, e);
	function n(t, n, r, i, a, o) {
		var s = e.call(this, t) || this;
		return s.onFinalize = a, s.shouldUnsubscribe = o, s._next = n ? function(e) {
			try {
				n(e);
			} catch (e) {
				t.error(e);
			}
		} : e.prototype._next, s._error = i ? function(e) {
			try {
				i(e);
			} catch (e) {
				t.error(e);
			} finally {
				this.unsubscribe();
			}
		} : e.prototype._error, s._complete = r ? function() {
			try {
				r();
			} catch (e) {
				t.error(e);
			} finally {
				this.unsubscribe();
			}
		} : e.prototype._complete, s;
	}
	return n.prototype.unsubscribe = function() {
		var t;
		if (!this.shouldUnsubscribe || this.shouldUnsubscribe()) {
			var n = this.closed;
			e.prototype.unsubscribe.call(this), !n && ((t = this.onFinalize) == null || t.call(this));
		}
	}, n;
}(T), pe = d(function(e) {
	return function() {
		e(this), this.name = "ObjectUnsubscribedError", this.message = "object unsubscribed";
	};
}), I = function(e) {
	t(n, e);
	function n() {
		var t = e.call(this) || this;
		return t.closed = !1, t.currentObservers = null, t.observers = [], t.isStopped = !1, t.hasError = !1, t.thrownError = null, t;
	}
	return n.prototype.lift = function(e) {
		var t = new L(this, this);
		return t.operator = e, t;
	}, n.prototype._throwIfClosed = function() {
		if (this.closed) throw new pe();
	}, n.prototype.next = function(e) {
		var t = this;
		w(function() {
			var n, r;
			if (t._throwIfClosed(), !t.isStopped) {
				t.currentObservers ||= Array.from(t.observers);
				try {
					for (var a = i(t.currentObservers), o = a.next(); !o.done; o = a.next()) o.value.next(e);
				} catch (e) {
					n = { error: e };
				} finally {
					try {
						o && !o.done && (r = a.return) && r.call(a);
					} finally {
						if (n) throw n.error;
					}
				}
			}
		});
	}, n.prototype.error = function(e) {
		var t = this;
		w(function() {
			if (t._throwIfClosed(), !t.isStopped) {
				t.hasError = t.isStopped = !0, t.thrownError = e;
				for (var n = t.observers; n.length;) n.shift().error(e);
			}
		});
	}, n.prototype.complete = function() {
		var e = this;
		w(function() {
			if (e._throwIfClosed(), !e.isStopped) {
				e.isStopped = !0;
				for (var t = e.observers; t.length;) t.shift().complete();
			}
		});
	}, n.prototype.unsubscribe = function() {
		this.isStopped = this.closed = !0, this.observers = this.currentObservers = null;
	}, Object.defineProperty(n.prototype, "observed", {
		get: function() {
			return this.observers?.length > 0;
		},
		enumerable: !1,
		configurable: !0
	}), n.prototype._trySubscribe = function(t) {
		return this._throwIfClosed(), e.prototype._trySubscribe.call(this, t);
	}, n.prototype._subscribe = function(e) {
		return this._throwIfClosed(), this._checkFinalizedStatuses(e), this._innerSubscribe(e);
	}, n.prototype._innerSubscribe = function(e) {
		var t = this, n = this, r = n.hasError, i = n.isStopped, a = n.observers;
		return r || i ? h : (this.currentObservers = null, a.push(e), new m(function() {
			t.currentObservers = null, p(a, e);
		}));
	}, n.prototype._checkFinalizedStatuses = function(e) {
		var t = this, n = t.hasError, r = t.thrownError, i = t.isStopped;
		n ? e.error(r) : i && e.complete();
	}, n.prototype.asObservable = function() {
		var e = new M();
		return e.source = this, e;
	}, n.create = function(e, t) {
		return new L(e, t);
	}, n;
}(M), L = function(e) {
	t(n, e);
	function n(t, n) {
		var r = e.call(this) || this;
		return r.destination = t, r.source = n, r;
	}
	return n.prototype.next = function(e) {
		var t, n;
		(n = (t = this.destination)?.next) == null || n.call(t, e);
	}, n.prototype.error = function(e) {
		var t, n;
		(n = (t = this.destination)?.error) == null || n.call(t, e);
	}, n.prototype.complete = function() {
		var e, t;
		(t = (e = this.destination)?.complete) == null || t.call(e);
	}, n.prototype._subscribe = function(e) {
		return this.source?.subscribe(e) ?? h;
	}, n;
}(I), me = new M(function(e) {
	return e.complete();
});
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/isScheduler.js
function he(e) {
	return e && u(e.schedule);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/args.js
function ge(e) {
	return e[e.length - 1];
}
function R(e) {
	return he(ge(e)) ? e.pop() : void 0;
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/isArrayLike.js
var z = (function(e) {
	return e && typeof e.length == "number" && typeof e != "function";
});
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/isPromise.js
function B(e) {
	return u(e?.then);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/isInteropObservable.js
function V(e) {
	return u(e[A]);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/isAsyncIterable.js
function H(e) {
	return Symbol.asyncIterator && u(e?.[Symbol.asyncIterator]);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/throwUnobservableError.js
function U(e) {
	return /* @__PURE__ */ TypeError("You provided " + (typeof e == "object" && e ? "an invalid object" : "'" + e + "'") + " where a stream was expected. You can provide an Observable, Promise, ReadableStream, Array, AsyncIterable, or Iterable.");
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/symbol/iterator.js
function _e() {
	return typeof Symbol != "function" || !Symbol.iterator ? "@@iterator" : Symbol.iterator;
}
var W = _e();
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/isIterable.js
function G(e) {
	return u(e?.[W]);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/isReadableStreamLike.js
function K(e) {
	return c(this, arguments, function() {
		var t, n, i, a;
		return r(this, function(r) {
			switch (r.label) {
				case 0: t = e.getReader(), r.label = 1;
				case 1: r.trys.push([
					1,
					,
					9,
					10
				]), r.label = 2;
				case 2: return [4, s(t.read())];
				case 3: return n = r.sent(), i = n.value, a = n.done, a ? [4, s(void 0)] : [3, 5];
				case 4: return [2, r.sent()];
				case 5: return [4, s(i)];
				case 6: return [4, r.sent()];
				case 7: return r.sent(), [3, 2];
				case 8: return [3, 10];
				case 9: return t.releaseLock(), [7];
				case 10: return [2];
			}
		});
	});
}
function q(e) {
	return u(e?.getReader);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/observable/innerFrom.js
function J(e) {
	if (e instanceof M) return e;
	if (e != null) {
		if (V(e)) return ve(e);
		if (z(e)) return ye(e);
		if (B(e)) return be(e);
		if (H(e)) return Y(e);
		if (G(e)) return xe(e);
		if (q(e)) return Se(e);
	}
	throw U(e);
}
function ve(e) {
	return new M(function(t) {
		var n = e[A]();
		if (u(n.subscribe)) return n.subscribe(t);
		throw TypeError("Provided object does not correctly implement Symbol.observable");
	});
}
function ye(e) {
	return new M(function(t) {
		for (var n = 0; n < e.length && !t.closed; n++) t.next(e[n]);
		t.complete();
	});
}
function be(e) {
	return new M(function(t) {
		e.then(function(e) {
			t.closed || (t.next(e), t.complete());
		}, function(e) {
			return t.error(e);
		}).then(null, b);
	});
}
function xe(e) {
	return new M(function(t) {
		var n, r;
		try {
			for (var a = i(e), o = a.next(); !o.done; o = a.next()) {
				var s = o.value;
				if (t.next(s), t.closed) return;
			}
		} catch (e) {
			n = { error: e };
		} finally {
			try {
				o && !o.done && (r = a.return) && r.call(a);
			} finally {
				if (n) throw n.error;
			}
		}
		t.complete();
	});
}
function Y(e) {
	return new M(function(t) {
		Ce(e, t).catch(function(e) {
			return t.error(e);
		});
	});
}
function Se(e) {
	return Y(K(e));
}
function Ce(e, t) {
	var i, a, o, s;
	return n(this, void 0, void 0, function() {
		var n, c;
		return r(this, function(r) {
			switch (r.label) {
				case 0: r.trys.push([
					0,
					5,
					6,
					11
				]), i = l(e), r.label = 1;
				case 1: return [4, i.next()];
				case 2:
					if (a = r.sent(), a.done) return [3, 4];
					if (n = a.value, t.next(n), t.closed) return [2];
					r.label = 3;
				case 3: return [3, 1];
				case 4: return [3, 11];
				case 5: return c = r.sent(), o = { error: c }, [3, 11];
				case 6: return r.trys.push([
					6,
					,
					9,
					10
				]), a && !a.done && (s = i.return) ? [4, s.call(i)] : [3, 8];
				case 7: r.sent(), r.label = 8;
				case 8: return [3, 10];
				case 9:
					if (o) throw o.error;
					return [7];
				case 10: return [7];
				case 11: return t.complete(), [2];
			}
		});
	});
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/util/executeSchedule.js
function X(e, t, n, r, i) {
	r === void 0 && (r = 0), i === void 0 && (i = !1);
	var a = t.schedule(function() {
		n(), i ? e.add(this.schedule(null, r)) : this.unsubscribe();
	}, r);
	if (e.add(a), !i) return a;
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/operators/observeOn.js
function Z(e, t) {
	return t === void 0 && (t = 0), P(function(n, r) {
		n.subscribe(F(r, function(n) {
			return X(r, e, function() {
				return r.next(n);
			}, t);
		}, function() {
			return X(r, e, function() {
				return r.complete();
			}, t);
		}, function(n) {
			return X(r, e, function() {
				return r.error(n);
			}, t);
		}));
	});
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/operators/subscribeOn.js
function we(e, t) {
	return t === void 0 && (t = 0), P(function(n, r) {
		r.add(e.schedule(function() {
			return n.subscribe(r);
		}, t));
	});
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/scheduled/scheduleObservable.js
function Te(e, t) {
	return J(e).pipe(we(t), Z(t));
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/scheduled/schedulePromise.js
function Ee(e, t) {
	return J(e).pipe(we(t), Z(t));
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/scheduled/scheduleArray.js
function De(e, t) {
	return new M(function(n) {
		var r = 0;
		return t.schedule(function() {
			r === e.length ? n.complete() : (n.next(e[r++]), n.closed || this.schedule());
		});
	});
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/scheduled/scheduleIterable.js
function Oe(e, t) {
	return new M(function(n) {
		var r;
		return X(n, t, function() {
			r = e[W](), X(n, t, function() {
				var e, t, i;
				try {
					e = r.next(), t = e.value, i = e.done;
				} catch (e) {
					n.error(e);
					return;
				}
				i ? n.complete() : n.next(t);
			}, 0, !0);
		}), function() {
			return u(r?.return) && r.return();
		};
	});
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/scheduled/scheduleAsyncIterable.js
function ke(e, t) {
	if (!e) throw Error("Iterable cannot be null");
	return new M(function(n) {
		X(n, t, function() {
			var r = e[Symbol.asyncIterator]();
			X(n, t, function() {
				r.next().then(function(e) {
					e.done ? n.complete() : n.next(e.value);
				});
			}, 0, !0);
		});
	});
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/scheduled/scheduleReadableStreamLike.js
function Ae(e, t) {
	return ke(K(e), t);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/scheduled/scheduled.js
function je(e, t) {
	if (e != null) {
		if (V(e)) return Te(e, t);
		if (z(e)) return De(e, t);
		if (B(e)) return Ee(e, t);
		if (H(e)) return ke(e, t);
		if (G(e)) return Oe(e, t);
		if (q(e)) return Ae(e, t);
	}
	throw U(e);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/observable/from.js
function Me(e, t) {
	return t ? je(e, t) : J(e);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/operators/map.js
function Ne(e, t) {
	return P(function(n, r) {
		var i = 0;
		n.subscribe(F(r, function(n) {
			r.next(e.call(t, n, i++));
		}));
	});
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/operators/mergeInternals.js
function Pe(e, t, n, r, i, a, o, s) {
	var c = [], l = 0, u = 0, d = !1, f = function() {
		d && !c.length && !l && t.complete();
	}, p = function(e) {
		return l < r ? m(e) : c.push(e);
	}, m = function(e) {
		a && t.next(e), l++;
		var s = !1;
		J(n(e, u++)).subscribe(F(t, function(e) {
			i?.(e), a ? p(e) : t.next(e);
		}, function() {
			s = !0;
		}, void 0, function() {
			if (s) try {
				l--;
				for (var e = function() {
					var e = c.shift();
					o ? X(t, o, function() {
						return m(e);
					}) : m(e);
				}; c.length && l < r;) e();
				f();
			} catch (e) {
				t.error(e);
			}
		}));
	};
	return e.subscribe(F(t, p, function() {
		d = !0, f();
	})), function() {
		s?.();
	};
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/operators/mergeMap.js
function Fe(e, t, n) {
	return n === void 0 && (n = Infinity), u(t) ? Fe(function(n, r) {
		return Ne(function(e, i) {
			return t(n, e, r, i);
		})(J(e(n, r)));
	}, n) : (typeof t == "number" && (n = t), P(function(t, r) {
		return Pe(t, r, e, n);
	}));
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/operators/mergeAll.js
function Ie(e) {
	return e === void 0 && (e = Infinity), Fe(j, e);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/operators/concatAll.js
function Le() {
	return Ie(1);
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/observable/concat.js
function Re() {
	var e = [...arguments];
	return Le()(Me(e, R(e)));
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/operators/filter.js
function ze(e, t) {
	return P(function(n, r) {
		var i = 0;
		n.subscribe(F(r, function(n) {
			return e.call(t, n, i++) && r.next(n);
		}));
	});
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/operators/defaultIfEmpty.js
function Be(e) {
	return P(function(t, n) {
		var r = !1;
		t.subscribe(F(n, function(e) {
			r = !0, n.next(e);
		}, function() {
			r || n.next(e), n.complete();
		}));
	});
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/operators/take.js
function Ve(e) {
	return e <= 0 ? function() {
		return me;
	} : P(function(t, n) {
		var r = 0;
		t.subscribe(F(n, function(t) {
			++r <= e && (n.next(t), e <= r && n.complete());
		}));
	});
}
//#endregion
//#region node_modules/rxjs/dist/esm5/internal/operators/startWith.js
function He() {
	var e = [...arguments], t = R(e);
	return P(function(n, r) {
		(t ? Re(e, n, t) : Re(e, n)).subscribe(r);
	});
}
//#endregion
//#region src/frame-image/frame-image-lookup.ts
var Ue = .001, We = class {
	_frameImages;
	constructor(e) {
		this._frameImages = e;
	}
	indexAt(e) {
		let t = 0, n = this._frameImages.length - 1, r = -1;
		for (; t <= n;) {
			let i = t + n >> 1;
			this._frameImages[i].start <= e ? (r = i, t = i + 1) : n = i - 1;
		}
		return r;
	}
}, Ge = class {
	_frameImages;
	_step;
	constructor(e, t) {
		this._frameImages = e, this._step = t;
	}
	indexAt(e) {
		let t = this._frameImages;
		if (t.length === 0 || e < t[0].start) return -1;
		let n = Math.min(Math.floor((e - t[0].start) / this._step), t.length - 1);
		for (; n > 0 && t[n].start > e;) n--;
		for (; n < t.length - 1 && t[n + 1].start <= e;) n++;
		return n;
	}
}, Ke = class {
	static create(e) {
		let t = this.resolveUniformStep(e);
		return t === void 0 ? new We(e) : new Ge(e, t);
	}
	static resolveUniformStep(e) {
		if (e.length < 2) return;
		let t = e[0].start, n = (e[e.length - 1].start - t) / (e.length - 1);
		if (n > 0) return e.every((e, r) => Math.abs(e.start - (t + r * n)) <= Ue) ? n : void 0;
	}
}, qe = class {
	_onFrameImageReady$ = new I();
	_options;
	_frameImages = [];
	_fetching = /* @__PURE__ */ new Map();
	_decoding = /* @__PURE__ */ new Set();
	_lookup = Ke.create([]);
	_fetchIndices = /* @__PURE__ */ new Set();
	_decodeIndices = /* @__PURE__ */ new Set();
	constructor(e = {}) {
		this._options = e;
	}
	get onFrameImageReady$() {
		return this._onFrameImageReady$.asObservable();
	}
	getFrameImage(e) {
		let t = this._frameImages[this._lookup.indexAt(e)];
		return t && e < t.end ? t.bitmap : void 0;
	}
	indexAt(e) {
		return this._lookup.indexAt(e);
	}
	whenReady$(e) {
		return this._onFrameImageReady$.pipe(He(void 0), ze(() => this.isReady(e)), Ve(1), Ne(() => void 0), Be(void 0));
	}
	isReady(e) {
		return e.every((e) => {
			let t = this._frameImages[this._lookup.indexAt(e)];
			return !t || !!t.bitmap;
		});
	}
	setFrameImages(e) {
		this.releaseAll(), this._frameImages = e.sort((e, t) => e.start - t.start), this._lookup = Ke.create(this._frameImages), this._fetchIndices = /* @__PURE__ */ new Set(), this._decodeIndices = /* @__PURE__ */ new Set();
	}
	setFetchTimes(e) {
		let t = this.resolveIndices(e);
		this._fetchIndices.forEach((e) => {
			t.has(e) || this.release(this._frameImages[e]);
		}), this._fetchIndices = t, t.forEach((e) => this.fetch(this._frameImages[e]));
	}
	setDecodeTimes(e) {
		let t = this.resolveIndices(e);
		this._decodeIndices.forEach((e) => {
			t.has(e) || this.releaseBitmap(this._frameImages[e]);
		}), this._decodeIndices = t, t.forEach((e) => this.decode(this._frameImages[e]));
	}
	resolveIndices(e) {
		let t = /* @__PURE__ */ new Set();
		return e.forEach((e) => {
			let n = this._lookup.indexAt(e);
			n >= 0 && t.add(n);
		}), t;
	}
	isInDecodeWindow(e) {
		return this._decodeIndices.has(this._lookup.indexAt(e.start));
	}
	fetch(e) {
		if (e.blob || this._fetching.has(e)) return;
		let t = new AbortController();
		this._fetching.set(e, t), fetch(e.url, {
			...this._options.requestInit?.(e.url),
			signal: t.signal
		}).then((t) => {
			if (!t.ok) throw Error(`Failed to fetch frame image: ${e.url}, status: ${t.status}`);
			return t.blob();
		}).then((n) => {
			this._fetching.get(e) === t && (this._fetching.delete(e), e.blob = n, e.fetchedAt = performance.now(), this.isInDecodeWindow(e) && this.decode(e));
		}).catch((n) => {
			this._fetching.get(e) === t && this._fetching.delete(e), t.signal.aborted || console.error(n);
		});
	}
	decode(e) {
		!e.blob || e.bitmap || this._decoding.has(e) || (this._decoding.add(e), e.decodeRequestedAt = performance.now(), (this._options.decode ? this._options.decode(e.blob) : createImageBitmap(e.blob)).then((t) => {
			if (!this._decoding.delete(e)) {
				t.close();
				return;
			}
			e.bitmap = t, this._onFrameImageReady$.next(e.url);
		}).catch((t) => {
			this._decoding.delete(e), console.error(t);
		}));
	}
	releaseBitmap(e) {
		this._decoding.delete(e), e.bitmap?.close(), e.bitmap = void 0, e.decodeRequestedAt = void 0;
	}
	release(e) {
		this._fetching.get(e)?.abort(), this._fetching.delete(e), e.blob = void 0, e.fetchedAt = void 0, this.releaseBitmap(e);
	}
	releaseAll() {
		this._frameImages.forEach((e) => this.release(e));
	}
	destroy() {
		this.releaseAll(), this._onFrameImageReady$.complete();
	}
}, Je = {
	fetchBehindDuration: 1,
	fetchAheadDuration: 2,
	fetchAheadMinCount: 10,
	decodeBehindCount: 1,
	decodeAheadCount: 10,
	bufferStopRatio: .4,
	bufferResumeRatio: .8
}, Q = class {
	static resolveRunningTime(e, t, n, r, i, a) {
		let o = Math.min(Math.max(e + t * n, 0), a), s = Math.floor(t / r);
		if (Math.abs(n) <= 1) {
			let t = e + s * r * n;
			return n < 0 ? Math.max(t, o) : Math.min(t, o);
		}
		return Math.min(Math.max(this.resolveTickTime(o, r, n, i), 0), a);
	}
	static resolveTickTime(e, t, n, r) {
		let i = t * Math.abs(n);
		return Math.floor(e / i) * i + Math.min(t, r) / 2;
	}
	static resolveTickStride(e, t, n, r) {
		let i = e.end - e.start, a = Math.max(n * Math.abs(r), i);
		return {
			base: this.resolveTickTime(t, n, r, i),
			stride: a * (r < 0 ? -1 : 1),
			wallStride: a / Math.abs(r)
		};
	}
	static resolveStride(e, t, n, r, i) {
		let a = e.end - e.start;
		if (i && Math.abs(r) > 1) return this.resolveTickStride(e, t, n, r);
		let o = Math.max(a, n);
		return {
			base: e.start + a / 2,
			stride: o * (r < 0 ? -1 : 1),
			wallStride: o
		};
	}
	static resolveLinearStride(e, t, n, r, i) {
		let a = e.end - e.start;
		return r && Math.abs(n) > 1 ? this.resolveTickStride(e, t, i ?? a, n) : this.resolveStride(e, t, a, n, r);
	}
	static resolveFetchTimes({ base: e, stride: t, wallStride: n }, r) {
		let i = Math.max(r.decodeBehindCount, Math.ceil(r.fetchBehindDuration / n)), a = Math.max(r.fetchAheadMinCount, r.decodeAheadCount, Math.ceil(r.fetchAheadDuration / n));
		return this.resolveStrideTimes(e, t, i, a);
	}
	static resolveDecodeTimes({ base: e, stride: t }, n) {
		return this.resolveStrideTimes(e, t, n.decodeBehindCount, n.decodeAheadCount);
	}
	static resolveBufferTimes({ base: e, stride: t }, n) {
		return this.resolveStrideTimes(e, t, 0, n.decodeAheadCount);
	}
	static resolveSeekReadyTimes({ base: e, stride: t }, n, r) {
		return this.resolveStrideTimes(e, t, 0, n ? r.decodeAheadCount : 0);
	}
	static resolveStrideTimes(e, t, n, r) {
		let i = [];
		for (let n = 0; n <= r; n++) i.push(e + n * t);
		for (let r = 1; r <= n; r++) i.push(e - r * t);
		return i;
	}
}, $ = self, Ye = new class {
	_requestInits = /* @__PURE__ */ new Map();
	_cache = new qe({ requestInit: (e) => this._requestInits.get(e) ?? {} });
	_config = Je;
	_canvas;
	_context;
	_frameImages = [];
	_clock;
	_index = -1;
	_renderedBitmap;
	_lastLoopAt = 0;
	_status;
	_stride;
	_buffering;
	constructor() {
		this._cache.onFrameImageReady$.subscribe(() => this.render()), this.loop();
	}
	handleMessage(e) {
		switch (e.type) {
			case "init":
				this._canvas = e.canvas, this._context = e.canvas.getContext("2d") ?? void 0;
				break;
			case "config":
				this._config = e.config, this._index = -1, this.render();
				break;
			case "frameImages":
				this.setFrameImages(e.frameImages);
				break;
			case "clock":
				this.applyClockToBuffering(e.clock), this._clock = e.clock, this._index = -1, this.render();
				break;
			case "resize":
				this.resize(e.width, e.height);
				break;
			case "clear":
				this._clock = void 0, this._status = void 0, this._stride = void 0, this._buffering = void 0, this.clearCanvas();
				break;
			case "whenReady":
				this._cache.whenReady$(e.times).subscribe(() => $.postMessage({
					type: "ready",
					id: e.id
				}));
				break;
		}
	}
	setFrameImages(e) {
		this._requestInits = new Map(e.filter((e) => e.requestInit).map((e) => [e.url, e.requestInit])), this._frameImages = e.map((e) => ({
			start: e.start,
			end: e.end,
			url: e.url
		})), this._cache.setFrameImages(this._frameImages), this._index = -1, this._stride = void 0, this._buffering = void 0, this.clearCanvas();
	}
	applyClockToBuffering(e) {
		let t = this._buffering;
		t && (e.playbackRate !== t.playbackRate || !e.running && Math.abs(e.anchorTime - t.time) > 2 * Math.abs(t.stride.stride) ? (console.debug(`Frame image buffering reset by clock at ${e.anchorTime.toFixed(3)}s, running ${e.running}, rate ${e.playbackRate}, buffering at ${t.time.toFixed(3)}s, rate ${t.playbackRate}`), this._buffering = void 0) : e.running && t.caughtUp && (console.debug(`Frame image buffering ended, clock runs again at ${e.anchorTime.toFixed(3)}s, buffered from ${t.time.toFixed(3)}s`), this._buffering = void 0));
	}
	loop() {
		let e = performance.now(), t = e - this._lastLoopAt;
		this._lastLoopAt = e, this.render(t), $.requestAnimationFrame ? $.requestAnimationFrame(() => this.loop()) : setTimeout(() => this.loop(), 1e3 / 60);
	}
	render(e) {
		if (!this._clock || this._frameImages.length === 0) return;
		let t = this.resolveFrameImageTime(this._clock), n;
		if (!this._clock.frameDuration) {
			let e = this._frameImages[Math.max(this._cache.indexAt(t), 0)];
			e && (n = Q.resolveLinearStride(e, t, this._clock.playbackRate, this._clock.running || !!this._buffering, this._clock.tickDuration), t = n.base);
		}
		let r = this._cache.indexAt(t), i = this._frameImages[r];
		if (!i) {
			this.postStatus(this._clock.version, this._cache.isReady([t]));
			return;
		}
		r !== this._index && (this._index = r, !i.bitmap && e !== void 0 && this._clock.running && console.warn(`Frame image render stall at ${t.toFixed(3)}s, index ${r}, ${i.blob ? "decode" : "fetch"} not ready, loop gap ${e.toFixed(0)}ms`), this.updateWindow(i, t, n)), this.updateBuffering(t), this.postStatus(this._clock.version, this._cache.isReady([t]));
		let a = this._cache.getFrameImage(t);
		a && a !== this._renderedBitmap && (this._renderedBitmap = a, this.drawBitmap(a));
	}
	updateBuffering(e) {
		let t = this._clock, n = this._buffering ? this._buffering.stride : t.running ? this._stride : void 0;
		if (!n) return;
		let r = Q.resolveBufferTimes(n, this._config), i = r.filter((e) => this._cache.isReady([e])).length / r.length;
		!this._buffering && i < this._config.bufferStopRatio ? (console.debug(`Frame image buffering started at ${e.toFixed(3)}s, rate ${t.playbackRate}, ratio ${i.toFixed(2)}, stride base ${n.base.toFixed(3)}s, stride ${n.stride.toFixed(3)}s`), this._buffering = {
			time: e,
			playbackRate: t.playbackRate,
			stride: n,
			caughtUp: !1
		}) : this._buffering && !this._buffering.caughtUp && i >= this._config.bufferResumeRatio && (console.debug(`Frame image buffering caught up at ${e.toFixed(3)}s, clock running ${t.running} at ${t.anchorTime.toFixed(3)}s, ratio ${i.toFixed(2)}, buffered from ${this._buffering.time.toFixed(3)}s`), this._buffering = {
			...this._buffering,
			caughtUp: !0
		});
	}
	postStatus(e, t) {
		let n = !!this._buffering && !this._buffering.caughtUp;
		this._status && this._status.version === e && this._status.ready === t && this._status.buffering === n || (this._status = {
			version: e,
			ready: t,
			buffering: n
		}, $.postMessage({
			type: "status",
			version: e,
			ready: t,
			buffering: n
		}));
	}
	updateWindow(e, t, n) {
		let r = this._clock, i = r.running ? n : this._buffering?.stride ?? n;
		if (!i) {
			if (!r.frameDuration) return;
			i = Q.resolveStride(e, t, r.frameDuration, r.playbackRate, r.running);
		}
		this._buffering && r.running && (console.debug(`Frame image buffering follows running clock from ${this._buffering.time.toFixed(3)}s to ${t.toFixed(3)}s`), this._buffering = {
			time: t,
			playbackRate: r.playbackRate,
			stride: i,
			caughtUp: !1
		}), this._stride = i, this._cache.setFetchTimes(Q.resolveFetchTimes(i, this._config)), this._cache.setDecodeTimes(Q.resolveDecodeTimes(i, this._config));
	}
	resolveFrameImageTime(e) {
		if (!e.running) return e.anchorTime;
		let t = (performance.timeOrigin + performance.now() - e.anchorEpoch) / 1e3;
		if (!e.frameDuration) return Math.min(Math.max(e.anchorTime + t * e.playbackRate, e.minTime ?? 0), e.duration);
		let n = this._frameImages[this._cache.indexAt(e.anchorTime)], r = n ? n.end - n.start : e.frameDuration;
		return Q.resolveRunningTime(e.anchorTime, t, e.playbackRate, e.frameDuration, r, e.duration);
	}
	drawBitmap(e) {
		let t = this._canvas, n = this._context;
		if (!t || !n || e.width === 0) return;
		let r = Math.min(t.width / e.width, t.height / e.height), i = e.width * r, a = e.height * r;
		n.clearRect(0, 0, t.width, t.height), n.drawImage(e, (t.width - i) / 2, (t.height - a) / 2, i, a);
	}
	resize(e, t) {
		!this._canvas || this._canvas.width === e && this._canvas.height === t || (this._canvas.width = e, this._canvas.height = t, this._renderedBitmap && this.drawBitmap(this._renderedBitmap));
	}
	clearCanvas() {
		this._renderedBitmap = void 0, this._canvas && this._context && this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);
	}
}();
$.onmessage = (e) => Ye.handleMessage(e.data), $.postMessage({ type: "started" });
//#endregion
