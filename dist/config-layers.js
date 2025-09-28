function p(l) {
  return typeof l == "string";
}
function c(l) {
  return l.split(new RegExp("(?<!\\.)\\.(?!\\.)")).map((t) => t.replace(/([^,])\.([.]+[^,])/gu, "$1$2"));
}
if (import.meta.vitest) {
  const { describe: l, it: t, expect: e } = import.meta.vitest;
  l("splitDotExceptDouble", () => {
    t("should split on single dots", () => {
      e(c("a.b.c")).toEqual(["a", "b", "c"]);
    }), t("should not split on double dots", () => {
      e(c("special..name")).toEqual(["special.name"]), e(c("a..b.c")).toEqual(["a.b", "c"]);
    }), t("should handle triple dots as two splits", () => {
      e(c("a...b.c")).toEqual(["a..b", "c"]);
    });
  });
}
function v(l, t) {
  for (const e in t)
    Object.prototype.hasOwnProperty.call(t, e) && typeof t[e] == "object" && t[e] !== null && !Array.isArray(t[e]) ? (e in l || (l[e] = {}), v(l[e], t[e])) : l[e] = t[e];
  return l;
}
function h(l) {
  return l && typeof l == "object" && !Object.isFrozen(l) && (Object.getOwnPropertyNames(l).forEach((t) => {
    const e = l[t];
    e && typeof e == "object" && h(e);
  }), Object.freeze(l)), l;
}
class d {
  layers;
  flattened;
  constructor(t, e = void 0) {
    this.layers = t, this.flattened = Array.from(this.layers.values()).reduce((n, i) => v(n, i), {}), this.options = {
      notFoundHandler: (n) => {
        throw new Error(`Key not found: ${String(n)}`);
      },
      freeze: !0,
      ...e ?? {}
    };
  }
  options;
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
  static fromLayers(t, e) {
    const n = new d(
      new Map(t.map((i) => [i.name, i.config])),
      e
    );
    return n.options.freeze && h(n), new Proxy(() => {
    }, {
      apply(i, r, s) {
        const [o, a] = s;
        return n.__withFallback(o, a);
      },
      has(i, r) {
        const s = p(r) ? c(r) : [r];
        return s.length == 1 ? n.__getFlat(s[0]) !== void 0 : s.length > 1 ? n.__getComplex(r) !== void 0 : !1;
      },
      getOwnPropertyDescriptor(i, r) {
        return {
          enumerable: !0,
          configurable: !0
        };
      },
      deleteProperty(i, r) {
        return !1;
      },
      set() {
        return !1;
      },
      defineProperty() {
        return !1;
      },
      ownKeys() {
        const r = Array.from(n.layers.values()).map((o) => Object.keys(o)), s = Array.from(
          new Set(r.flat())
        );
        return { ...s, length: s.length };
      },
      get(i, r, s) {
        if (r === "__inspect")
          return n.__inspect.bind(n);
        if (r === "__derive")
          return n.__derive.bind(n);
        const o = p(r) ? c(r) : [r];
        if (o.length == 1)
          return n.__getFlat(o[0]);
        if (o.length > 1)
          return n.__getComplex(r);
      }
    });
  }
  __withFallback(t, e) {
    const n = p(t) ? c(t) : [t];
    return n.length == 1 ? this.__getFlat(n[0], e) : this.__getComplex(t, e);
  }
  __derive(t, e, n) {
    const i = Array.from(this.layers.entries()).reduce(
      (r, [s, o]) => (r[s] = o, r),
      {}
    );
    if (typeof t == "object" && e === void 0) {
      const r = Object.assign({}, this.options, t);
      return d.fromLayers(
        Object.entries(i).map(([s, o]) => ({ name: s, config: o })),
        r
      );
    }
    return typeof t == "string" && e !== void 0 ? (i[t] = e, d.fromLayers(
      Object.entries(i).map(([r, s]) => ({ name: r, config: s })),
      Object.assign({}, this.options, n ?? {})
    )) : d.fromLayers(
      Object.entries(i).map(([r, s]) => ({ name: r, config: s })),
      Object.assign({}, this.options, n ?? {})
    );
  }
  __getComplex(t, e) {
    const n = p(t) ? c(t) : [t], i = Array.from(this.layers.values()).reverse();
    let r = {}, s;
    for (const o of i) {
      if (!o) continue;
      let a = o, u = !0;
      for (const f of n)
        if (a && f in a)
          a = a[f];
        else {
          u = !1;
          break;
        }
      if (u && typeof a != "object") {
        s = a;
        break;
      } else
        u && typeof a == "object" && (s = void 0, r = {
          ...r,
          ...a
        });
    }
    return s !== void 0 ? s : Object.keys(r).length > 0 ? r : e || this.options.notFoundHandler(t);
  }
  __getFlat(t, e) {
    const n = this.flattened[t];
    return n !== void 0 ? n : e || this.options.notFoundHandler(t);
  }
  /**
   * Inspects a configuration key, providing details about its value and source across layers.
   *
   * @param key - The configuration key to inspect.
   * @returns An object containing inspection results, including the resolved value and layer details.
   */
  __inspect(t) {
    const e = {
      key: t,
      resolved: {
        value: void 0,
        source: ""
      },
      layers: []
    }, n = p(t) ? c(t) : [t], i = Array.from(this.layers.keys()).reverse();
    if (n.length < 1)
      return {
        key: t,
        resolved: {
          value: void 0,
          source: ""
        },
        layers: i.map((r) => ({
          layer: r,
          value: void 0,
          isPresent: !1,
          isActive: !1
        }))
      };
    if (n.length == 1) {
      let r = !1;
      for (const s of i) {
        const o = this.layers.get(s), a = !!(o && t in o), u = a ? o?.[t] : void 0, f = a ? !r : !1;
        e.layers.push({
          layer: s,
          value: a ? u : void 0,
          isPresent: a,
          isActive: f
        }), f && !r && (e.resolved.value = u, e.resolved.source = s, r = !0);
      }
    }
    if (n.length > 1)
      for (const r of i) {
        let s = this.layers.get(r);
        if (!s)
          continue;
        let o = !0;
        for (const u of n)
          if (s && typeof s == "object" && u in s)
            s = s[u];
          else {
            o = !1;
            break;
          }
        o || (s = void 0);
        const a = o && s !== void 0;
        e.layers.push({
          layer: r,
          value: a ? s : void 0,
          isPresent: o,
          isActive: a && e.resolved.value === void 0
        }), a && e.resolved.value === void 0 && (e.resolved.value = s, e.resolved.source = r);
      }
    return e;
  }
}
export {
  d as LayeredConfig
};
