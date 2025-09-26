function u(d) {
  return typeof d == "string";
}
function f(d) {
  return d.split(new RegExp("(?<!\\.)\\.(?!\\.)"));
}
class c {
  layers;
  constructor(t) {
    this.layers = t;
  }
  notFoundHandler = (t) => {
    throw new Error(`Key not found: ${String(t)}`);
  };
  /**
   * Creates an instance of LayeredConfig from an array of layer objects.
   *
   * @param layers - The configuration layers to merge.
   * @param options - Optional settings for the instance.
   * @param options.notFoundHandler - Custom handler for not found keys.
   * @returns LayeredConfig following the Schema
   *
   * Check `LayeredConfig` class documentation for usage example.
   * @see LayeredConfig
   *
   */
  static fromLayers(t, s) {
    const n = new c(
      new Map(t.map((i) => [i.name, i.config]))
    );
    return s?.notFoundHandler && (n.notFoundHandler = s.notFoundHandler), new Proxy(() => {
    }, {
      apply(i, e, r) {
        const [o, a] = r;
        return n.__withFallback(o, a);
      },
      has(i, e) {
        const r = u(e) ? f(e) : [e];
        return r.length == 1 ? n.__getFlat(e) !== void 0 : r.length > 1 ? n.__getComplex(e) !== void 0 : !1;
      },
      getOwnPropertyDescriptor(i, e) {
        return {
          enumerable: !0,
          configurable: !0
        };
      },
      deleteProperty(i, e) {
        return !1;
      },
      set() {
        return !1;
      },
      defineProperty() {
        return !1;
      },
      ownKeys() {
        const e = Array.from(n.layers.values()).map((o) => Object.keys(o)), r = Array.from(
          new Set(e.flat())
        );
        return { ...r, length: r.length };
      },
      get(i, e, r) {
        if (e === "__inspect")
          return n.__inspect.bind(n);
        if (e === "__derive")
          return n.__derive.bind(n);
        const o = u(e) ? f(e) : [e];
        if (o.length == 1)
          return n.__getFlat(e);
        if (o.length > 1)
          return n.__getComplex(e);
      }
    });
  }
  __withFallback(t, s) {
    return (u(t) ? f(t) : [t]).length == 1 ? this.__getFlat(t, s) : this.__getComplex(t, s);
  }
  __derive(t, s, n) {
    const i = Array.from(this.layers.entries()).reduce(
      (e, [r, o]) => (e[r] = o, e),
      {}
    );
    if (typeof t == "object" && s === void 0) {
      const e = Object.assign({}, {
        notFoundHandler: this.notFoundHandler
      }, t);
      return c.fromLayers(
        Object.entries(i).map(([r, o]) => ({ name: r, config: o })),
        e
      );
    }
    return typeof t == "string" && s !== void 0 ? (i[t] = s, c.fromLayers(
      Object.entries(i).map(([e, r]) => ({ name: e, config: r })),
      Object.assign({}, {
        notFoundHandler: this.notFoundHandler
      }, n ?? {})
    )) : c.fromLayers(
      Object.entries(i).map(([e, r]) => ({ name: e, config: r })),
      Object.assign({}, {
        notFoundHandler: this.notFoundHandler
      }, n ?? {})
    );
  }
  __getComplex(t, s) {
    const n = u(t) ? f(t) : [t], i = Array.from(this.layers.values()).reverse();
    let e;
    for (const r of i) {
      if (!r) continue;
      let o = r, a = !0;
      for (const l of n)
        if (o && l in o)
          o = o[l];
        else {
          a = !1;
          break;
        }
      if (a) {
        e = o;
        break;
      }
    }
    return e !== void 0 ? e : s || this.notFoundHandler(t);
  }
  __getFlat(t, s) {
    for (const n of Array.from(this.layers.values()).reverse())
      if (n && t in n)
        return n[t];
    return s || this.notFoundHandler(t);
  }
  /**
   * Inspects a configuration key, providing details about its value and source across layers.
   *
   * @param key - The configuration key to inspect.
   * @returns An object containing inspection results, including the resolved value and layer details.
   */
  __inspect(t) {
    const s = {
      key: t,
      resolved: {
        value: void 0,
        source: ""
      },
      layers: []
    }, n = u(t) ? f(t) : [t], i = Array.from(this.layers.keys()).reverse();
    if (n.length < 1)
      return {
        key: t,
        resolved: {
          value: void 0,
          source: ""
        },
        layers: i.map((e) => ({
          layer: e,
          value: void 0,
          isPresent: !1,
          isActive: !1
        }))
      };
    if (n.length == 1) {
      let e = !1;
      for (const r of i) {
        const o = this.layers.get(r), a = !!(o && t in o), l = a ? o?.[t] : void 0, v = a ? !e : !1;
        s.layers.push({
          layer: r,
          value: a ? l : void 0,
          isPresent: a,
          isActive: v
        }), v && !e && (s.resolved.value = l, s.resolved.source = r, e = !0);
      }
    }
    if (n.length > 1)
      for (const e of i) {
        let r = this.layers.get(e);
        if (!r)
          continue;
        let o = !0;
        for (const l of n)
          if (r && typeof r == "object" && l in r)
            r = r[l];
          else {
            o = !1;
            break;
          }
        o || (r = void 0);
        const a = o && r !== void 0;
        s.layers.push({
          layer: e,
          value: a ? r : void 0,
          isPresent: o,
          isActive: a && s.resolved.value === void 0
        }), a && s.resolved.value === void 0 && (s.resolved.value = r, s.resolved.source = e);
      }
    return s;
  }
}
export {
  c as LayeredConfig
};
