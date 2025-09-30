(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? factory(exports) : typeof define === "function" && define.amd ? define(["exports"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, factory(global["Config Layers"] = {}));
})(this, (function(exports2) {
  "use strict";
  function isString(key) {
    return typeof key === "string";
  }
  function splitDotExceptDouble(str) {
    return str.split(new RegExp("(?<!\\.)\\.(?!\\.)")).map((part) => {
      return part.replace(/([^,])\.([.]+[^,])/gu, "$1$2");
    });
  }
  if (void 0) {
    const { describe, it, expect } = void 0;
    describe("splitDotExceptDouble", () => {
      it("should split on single dots", () => {
        expect(splitDotExceptDouble("a.b.c")).toEqual(["a", "b", "c"]);
      });
      it("should not split on double dots", () => {
        expect(splitDotExceptDouble("special..name")).toEqual(["special.name"]);
        expect(splitDotExceptDouble("a..b.c")).toEqual(["a.b", "c"]);
      });
      it("should handle triple dots as two splits", () => {
        expect(splitDotExceptDouble("a...b.c")).toEqual(["a..b", "c"]);
      });
    });
  }
  function deepMerge(target, source) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key) && typeof source[key] === "object" && source[key] !== null && !Array.isArray(source[key])) {
        if (!(key in target)) {
          target[key] = {};
        }
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }
  function deepFreeze(obj) {
    if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
      Object.getOwnPropertyNames(obj).forEach((prop) => {
        const value = obj[prop];
        if (value && typeof value === "object") {
          deepFreeze(value);
        }
      });
      Object.freeze(obj);
    }
    return obj;
  }
  class LayeredConfig {
    layers;
    flattened;
    constructor(layers, options = void 0) {
      this.layers = layers;
      this.flattened = Array.from(this.layers.values()).reduce((acc, layer) => {
        return deepMerge(acc, layer);
      }, {});
      this.options = {
        ...{
          notFoundHandler: (key) => {
            throw new Error(`Key not found: ${String(key)}`);
          },
          freeze: true
        },
        ...options ?? {}
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
    static fromLayers(layers, options) {
      const instance = new LayeredConfig(
        new Map(layers.map((l) => [l.name, l.config])),
        options
      );
      if (instance.options.freeze)
        deepFreeze(instance);
      return new Proxy(() => {
      }, {
        apply(_target, _this, argArray) {
          const [key, fallback] = argArray;
          return instance.__withFallback(key, fallback);
        },
        has(_target, key) {
          const treeKeyParts = isString(key) ? splitDotExceptDouble(key) : [key];
          if (treeKeyParts.length == 1) {
            return instance.__getFlat(treeKeyParts[0]) !== void 0;
          }
          if (treeKeyParts.length > 1) {
            return instance.__getComplex(key) !== void 0;
          }
          return false;
        },
        getOwnPropertyDescriptor(_target, _prop) {
          return {
            enumerable: true,
            configurable: true
          };
        },
        deleteProperty(_target, _prop) {
          return false;
        },
        set() {
          return false;
        },
        defineProperty() {
          return false;
        },
        ownKeys() {
          const layers2 = Array.from(instance.layers.values());
          const allKeys = layers2.map((l) => Object.keys(l));
          const keys = Array.from(
            new Set(allKeys.flat())
          );
          return { ...keys, length: keys.length };
        },
        get(_target, key, _receiver) {
          if (key === "__inspect") {
            return instance.__inspect.bind(instance);
          }
          if (key === "__derive") {
            return instance.__derive.bind(instance);
          }
          if (key === "getAll") {
            return instance.__getAll.bind(instance);
          }
          const treeKeyParts = isString(key) ? splitDotExceptDouble(key) : [key];
          if (treeKeyParts.length == 1) {
            return instance.__getFlat(treeKeyParts[0]);
          }
          if (treeKeyParts.length > 1) {
            return instance.__getComplex(key);
          }
        }
      });
    }
    __withFallback(key, fallback) {
      const treeKeyParts = isString(key) ? splitDotExceptDouble(key) : [key];
      if (treeKeyParts.length == 1) {
        return this.__getFlat(treeKeyParts[0], fallback);
      }
      return this.__getComplex(key, fallback);
    }
    __derive(nameOrOpts, layer, opts) {
      const newLayers = Array.from(this.layers.entries()).reduce(
        (acc, [name, layer2]) => {
          acc[name] = layer2;
          return acc;
        },
        {}
      );
      if (typeof nameOrOpts === "object" && layer === void 0) {
        const newOpts = Object.assign({}, this.options, nameOrOpts);
        return LayeredConfig.fromLayers(
          Object.entries(newLayers).map(([name, config]) => ({ name, config })),
          newOpts
        );
      }
      if (typeof nameOrOpts === "string" && layer !== void 0) {
        newLayers[nameOrOpts] = layer;
        return LayeredConfig.fromLayers(
          Object.entries(newLayers).map(([name, config]) => ({ name, config })),
          Object.assign({}, this.options, opts ?? {})
        );
      }
      return LayeredConfig.fromLayers(
        Object.entries(newLayers).map(([name, config]) => ({ name, config })),
        Object.assign({}, this.options, opts ?? {})
      );
    }
    __getAll(key) {
      const treeKeyParts = isString(key) ? splitDotExceptDouble(key) : [key];
      const layers = Array.from(this.layers.entries()).reverse();
      const results = [];
      for (const [layerName, layer] of layers) {
        if (!layer) continue;
        let currentLayer = layer;
        let found = true;
        for (const part of treeKeyParts) {
          if (currentLayer && part in currentLayer) {
            currentLayer = currentLayer[part];
          } else {
            found = false;
            break;
          }
        }
        if (found) {
          results.push({ layer: layerName, value: currentLayer });
        }
      }
      return results;
    }
    __getComplex(key, fallback) {
      const treeKeyParts = isString(key) ? splitDotExceptDouble(key) : [key];
      const layers = Array.from(this.layers.values()).reverse();
      let resultingObject = {};
      let current = void 0;
      for (const layer of layers) {
        if (!layer) continue;
        let currentLayer = layer;
        let found = true;
        for (const part of treeKeyParts) {
          if (currentLayer && part in currentLayer) {
            currentLayer = currentLayer[part];
          } else {
            found = false;
            break;
          }
        }
        if (found && typeof currentLayer != "object") {
          current = currentLayer;
          break;
        } else {
          if (found && typeof currentLayer === "object") {
            current = void 0;
            resultingObject = {
              ...resultingObject,
              ...currentLayer
            };
          }
        }
      }
      if (current !== void 0) {
        return current;
      }
      if (Object.keys(resultingObject).length > 0) {
        return resultingObject;
      }
      if (fallback)
        return fallback;
      return this.options.notFoundHandler(key);
    }
    __getFlat(key, fallback) {
      const value = this.flattened[key];
      if (value !== void 0)
        return value;
      if (fallback)
        return fallback;
      return this.options.notFoundHandler(key);
    }
    /**
     * Inspects a configuration key, providing details about its value and source across layers.
     *
     * @param key - The configuration key to inspect.
     * @returns An object containing inspection results, including the resolved value and layer details.
     */
    __inspect(key) {
      const result = {
        key,
        resolved: {
          value: void 0,
          source: ""
        },
        layers: []
      };
      const keyParts = isString(key) ? splitDotExceptDouble(key) : [key];
      const precedence = Array.from(this.layers.keys()).reverse();
      if (keyParts.length < 1) {
        return {
          key,
          resolved: {
            value: void 0,
            source: ""
          },
          layers: precedence.map((layer) => ({
            layer,
            value: void 0,
            isPresent: false,
            isActive: false
          }))
        };
      }
      if (keyParts.length == 1) {
        let found = false;
        for (const layerName of precedence) {
          const layer = this.layers.get(layerName);
          const isPresent = !!(layer && key in layer);
          const value = isPresent ? layer?.[key] : void 0;
          const isActive = isPresent ? !found : false;
          result.layers.push({
            layer: layerName,
            value: isPresent ? value : void 0,
            isPresent,
            isActive
          });
          if (isActive && !found) {
            result.resolved.value = value;
            result.resolved.source = layerName;
            found = true;
          }
        }
      }
      if (keyParts.length > 1) {
        for (const layer of precedence) {
          let current = this.layers.get(layer);
          if (!current)
            continue;
          let found = true;
          for (const part of keyParts) {
            if (current && typeof current === "object" && part in current) {
              current = current[part];
            } else {
              found = false;
              break;
            }
          }
          if (!found)
            current = void 0;
          const isActive = found && current !== void 0;
          result.layers.push({
            layer,
            value: isActive ? current : void 0,
            isPresent: found,
            isActive: isActive && result.resolved.value === void 0
          });
          if (isActive && result.resolved.value === void 0) {
            result.resolved.value = current;
            result.resolved.source = layer;
          }
        }
      }
      return result;
    }
  }
  exports2.LayeredConfig = LayeredConfig;
  Object.defineProperty(exports2, Symbol.toStringTag, { value: "Module" });
}));
