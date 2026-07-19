var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  __defProp(target, "default", { value: mod, enumerable: true }) ,
  mod
));

// node_modules/@dagrejs/graphlib/lib/graph.js
var require_graph = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/graph.js"(exports, module) {
    var DEFAULT_EDGE_NAME = "\0";
    var GRAPH_NODE = "\0";
    var EDGE_KEY_DELIM = "";
    var Graph = class {
      _isDirected = true;
      _isMultigraph = false;
      _isCompound = false;
      // Label for the graph itself
      _label;
      // Defaults to be set when creating a new node
      _defaultNodeLabelFn = () => void 0;
      // Defaults to be set when creating a new edge
      _defaultEdgeLabelFn = () => void 0;
      // v -> label
      _nodes = {};
      // v -> edgeObj
      _in = {};
      // u -> v -> Number
      _preds = {};
      // v -> edgeObj
      _out = {};
      // v -> w -> Number
      _sucs = {};
      // e -> edgeObj
      _edgeObjs = {};
      // e -> label
      _edgeLabels = {};
      /* Number of nodes in the graph. Should only be changed by the implementation. */
      _nodeCount = 0;
      /* Number of edges in the graph. Should only be changed by the implementation. */
      _edgeCount = 0;
      _parent;
      _children;
      constructor(opts) {
        if (opts) {
          this._isDirected = Object.hasOwn(opts, "directed") ? opts.directed : true;
          this._isMultigraph = Object.hasOwn(opts, "multigraph") ? opts.multigraph : false;
          this._isCompound = Object.hasOwn(opts, "compound") ? opts.compound : false;
        }
        if (this._isCompound) {
          this._parent = {};
          this._children = {};
          this._children[GRAPH_NODE] = {};
        }
      }
      /* === Graph functions ========= */
      /**
       * Whether graph was created with 'directed' flag set to true or not.
       */
      isDirected() {
        return this._isDirected;
      }
      /**
       * Whether graph was created with 'multigraph' flag set to true or not.
       */
      isMultigraph() {
        return this._isMultigraph;
      }
      /**
       * Whether graph was created with 'compound' flag set to true or not.
       */
      isCompound() {
        return this._isCompound;
      }
      /**
       * Sets the label of the graph.
       */
      setGraph(label) {
        this._label = label;
        return this;
      }
      /**
       * Gets the graph label.
       */
      graph() {
        return this._label;
      }
      /* === Node functions ========== */
      /**
       * Sets the default node label. If newDefault is a function, it will be
       * invoked ach time when setting a label for a node. Otherwise, this label
       * will be assigned as default label in case if no label was specified while
       * setting a node.
       * Complexity: O(1).
       */
      setDefaultNodeLabel(newDefault) {
        this._defaultNodeLabelFn = newDefault;
        if (typeof newDefault !== "function") {
          this._defaultNodeLabelFn = () => newDefault;
        }
        return this;
      }
      /**
       * Gets the number of nodes in the graph.
       * Complexity: O(1).
       */
      nodeCount() {
        return this._nodeCount;
      }
      /**
       * Gets all nodes of the graph. Note, the in case of compound graph subnodes are
       * not included in list.
       * Complexity: O(1).
       */
      nodes() {
        return Object.keys(this._nodes);
      }
      /**
       * Gets list of nodes without in-edges.
       * Complexity: O(|V|).
       */
      sources() {
        var self = this;
        return this.nodes().filter((v) => Object.keys(self._in[v]).length === 0);
      }
      /**
       * Gets list of nodes without out-edges.
       * Complexity: O(|V|).
       */
      sinks() {
        var self = this;
        return this.nodes().filter((v) => Object.keys(self._out[v]).length === 0);
      }
      /**
       * Invokes setNode method for each node in names list.
       * Complexity: O(|names|).
       */
      setNodes(vs, value) {
        var args = arguments;
        var self = this;
        vs.forEach(function(v) {
          if (args.length > 1) {
            self.setNode(v, value);
          } else {
            self.setNode(v);
          }
        });
        return this;
      }
      /**
       * Creates or updates the value for the node v in the graph. If label is supplied
       * it is set as the value for the node. If label is not supplied and the node was
       * created by this call then the default node label will be assigned.
       * Complexity: O(1).
       */
      setNode(v, value) {
        if (Object.hasOwn(this._nodes, v)) {
          if (arguments.length > 1) {
            this._nodes[v] = value;
          }
          return this;
        }
        this._nodes[v] = arguments.length > 1 ? value : this._defaultNodeLabelFn(v);
        if (this._isCompound) {
          this._parent[v] = GRAPH_NODE;
          this._children[v] = {};
          this._children[GRAPH_NODE][v] = true;
        }
        this._in[v] = {};
        this._preds[v] = {};
        this._out[v] = {};
        this._sucs[v] = {};
        ++this._nodeCount;
        return this;
      }
      /**
       * Gets the label of node with specified name.
       * Complexity: O(|V|).
       */
      node(v) {
        return this._nodes[v];
      }
      /**
       * Detects whether graph has a node with specified name or not.
       */
      hasNode(v) {
        return Object.hasOwn(this._nodes, v);
      }
      /**
       * Remove the node with the name from the graph or do nothing if the node is not in
       * the graph. If the node was removed this function also removes any incident
       * edges.
       * Complexity: O(1).
       */
      removeNode(v) {
        var self = this;
        if (Object.hasOwn(this._nodes, v)) {
          var removeEdge = (e) => self.removeEdge(self._edgeObjs[e]);
          delete this._nodes[v];
          if (this._isCompound) {
            this._removeFromParentsChildList(v);
            delete this._parent[v];
            this.children(v).forEach(function(child) {
              self.setParent(child);
            });
            delete this._children[v];
          }
          Object.keys(this._in[v]).forEach(removeEdge);
          delete this._in[v];
          delete this._preds[v];
          Object.keys(this._out[v]).forEach(removeEdge);
          delete this._out[v];
          delete this._sucs[v];
          --this._nodeCount;
        }
        return this;
      }
      /**
       * Sets node p as a parent for node v if it is defined, or removes the
       * parent for v if p is undefined. Method throws an exception in case of
       * invoking it in context of noncompound graph.
       * Average-case complexity: O(1).
       */
      setParent(v, parent) {
        if (!this._isCompound) {
          throw new Error("Cannot set parent in a non-compound graph");
        }
        if (parent === void 0) {
          parent = GRAPH_NODE;
        } else {
          parent += "";
          for (var ancestor = parent; ancestor !== void 0; ancestor = this.parent(ancestor)) {
            if (ancestor === v) {
              throw new Error("Setting " + parent + " as parent of " + v + " would create a cycle");
            }
          }
          this.setNode(parent);
        }
        this.setNode(v);
        this._removeFromParentsChildList(v);
        this._parent[v] = parent;
        this._children[parent][v] = true;
        return this;
      }
      _removeFromParentsChildList(v) {
        delete this._children[this._parent[v]][v];
      }
      /**
       * Gets parent node for node v.
       * Complexity: O(1).
       */
      parent(v) {
        if (this._isCompound) {
          var parent = this._parent[v];
          if (parent !== GRAPH_NODE) {
            return parent;
          }
        }
      }
      /**
       * Gets list of direct children of node v.
       * Complexity: O(1).
       */
      children(v = GRAPH_NODE) {
        if (this._isCompound) {
          var children = this._children[v];
          if (children) {
            return Object.keys(children);
          }
        } else if (v === GRAPH_NODE) {
          return this.nodes();
        } else if (this.hasNode(v)) {
          return [];
        }
      }
      /**
       * Return all nodes that are predecessors of the specified node or undefined if node v is not in
       * the graph. Behavior is undefined for undirected graphs - use neighbors instead.
       * Complexity: O(|V|).
       */
      predecessors(v) {
        var predsV = this._preds[v];
        if (predsV) {
          return Object.keys(predsV);
        }
      }
      /**
       * Return all nodes that are successors of the specified node or undefined if node v is not in
       * the graph. Behavior is undefined for undirected graphs - use neighbors instead.
       * Complexity: O(|V|).
       */
      successors(v) {
        var sucsV = this._sucs[v];
        if (sucsV) {
          return Object.keys(sucsV);
        }
      }
      /**
       * Return all nodes that are predecessors or successors of the specified node or undefined if
       * node v is not in the graph.
       * Complexity: O(|V|).
       */
      neighbors(v) {
        var preds = this.predecessors(v);
        if (preds) {
          const union = new Set(preds);
          for (var succ of this.successors(v)) {
            union.add(succ);
          }
          return Array.from(union.values());
        }
      }
      isLeaf(v) {
        var neighbors;
        if (this.isDirected()) {
          neighbors = this.successors(v);
        } else {
          neighbors = this.neighbors(v);
        }
        return neighbors.length === 0;
      }
      /**
       * Creates new graph with nodes filtered via filter. Edges incident to rejected node
       * are also removed. In case of compound graph, if parent is rejected by filter,
       * than all its children are rejected too.
       * Average-case complexity: O(|E|+|V|).
       */
      filterNodes(filter) {
        var copy = new this.constructor({
          directed: this._isDirected,
          multigraph: this._isMultigraph,
          compound: this._isCompound
        });
        copy.setGraph(this.graph());
        var self = this;
        Object.entries(this._nodes).forEach(function([v, value]) {
          if (filter(v)) {
            copy.setNode(v, value);
          }
        });
        Object.values(this._edgeObjs).forEach(function(e) {
          if (copy.hasNode(e.v) && copy.hasNode(e.w)) {
            copy.setEdge(e, self.edge(e));
          }
        });
        var parents = {};
        function findParent(v) {
          var parent = self.parent(v);
          if (parent === void 0 || copy.hasNode(parent)) {
            parents[v] = parent;
            return parent;
          } else if (parent in parents) {
            return parents[parent];
          } else {
            return findParent(parent);
          }
        }
        if (this._isCompound) {
          copy.nodes().forEach((v) => copy.setParent(v, findParent(v)));
        }
        return copy;
      }
      /* === Edge functions ========== */
      /**
       * Sets the default edge label or factory function. This label will be
       * assigned as default label in case if no label was specified while setting
       * an edge or this function will be invoked each time when setting an edge
       * with no label specified and returned value * will be used as a label for edge.
       * Complexity: O(1).
       */
      setDefaultEdgeLabel(newDefault) {
        this._defaultEdgeLabelFn = newDefault;
        if (typeof newDefault !== "function") {
          this._defaultEdgeLabelFn = () => newDefault;
        }
        return this;
      }
      /**
       * Gets the number of edges in the graph.
       * Complexity: O(1).
       */
      edgeCount() {
        return this._edgeCount;
      }
      /**
       * Gets edges of the graph. In case of compound graph subgraphs are not considered.
       * Complexity: O(|E|).
       */
      edges() {
        return Object.values(this._edgeObjs);
      }
      /**
       * Establish an edges path over the nodes in nodes list. If some edge is already
       * exists, it will update its label, otherwise it will create an edge between pair
       * of nodes with label provided or default label if no label provided.
       * Complexity: O(|nodes|).
       */
      setPath(vs, value) {
        var self = this;
        var args = arguments;
        vs.reduce(function(v, w) {
          if (args.length > 1) {
            self.setEdge(v, w, value);
          } else {
            self.setEdge(v, w);
          }
          return w;
        });
        return this;
      }
      /**
       * Creates or updates the label for the edge (v, w) with the optionally supplied
       * name. If label is supplied it is set as the value for the edge. If label is not
       * supplied and the edge was created by this call then the default edge label will
       * be assigned. The name parameter is only useful with multigraphs.
       */
      setEdge() {
        var v, w, name, value;
        var valueSpecified = false;
        var arg0 = arguments[0];
        if (typeof arg0 === "object" && arg0 !== null && "v" in arg0) {
          v = arg0.v;
          w = arg0.w;
          name = arg0.name;
          if (arguments.length === 2) {
            value = arguments[1];
            valueSpecified = true;
          }
        } else {
          v = arg0;
          w = arguments[1];
          name = arguments[3];
          if (arguments.length > 2) {
            value = arguments[2];
            valueSpecified = true;
          }
        }
        v = "" + v;
        w = "" + w;
        if (name !== void 0) {
          name = "" + name;
        }
        var e = edgeArgsToId(this._isDirected, v, w, name);
        if (Object.hasOwn(this._edgeLabels, e)) {
          if (valueSpecified) {
            this._edgeLabels[e] = value;
          }
          return this;
        }
        if (name !== void 0 && !this._isMultigraph) {
          throw new Error("Cannot set a named edge when isMultigraph = false");
        }
        this.setNode(v);
        this.setNode(w);
        this._edgeLabels[e] = valueSpecified ? value : this._defaultEdgeLabelFn(v, w, name);
        var edgeObj = edgeArgsToObj(this._isDirected, v, w, name);
        v = edgeObj.v;
        w = edgeObj.w;
        Object.freeze(edgeObj);
        this._edgeObjs[e] = edgeObj;
        incrementOrInitEntry(this._preds[w], v);
        incrementOrInitEntry(this._sucs[v], w);
        this._in[w][e] = edgeObj;
        this._out[v][e] = edgeObj;
        this._edgeCount++;
        return this;
      }
      /**
       * Gets the label for the specified edge.
       * Complexity: O(1).
       */
      edge(v, w, name) {
        var e = arguments.length === 1 ? edgeObjToId(this._isDirected, arguments[0]) : edgeArgsToId(this._isDirected, v, w, name);
        return this._edgeLabels[e];
      }
      /**
       * Gets the label for the specified edge and converts it to an object.
       * Complexity: O(1)
       */
      edgeAsObj() {
        const edge = this.edge(...arguments);
        if (typeof edge !== "object") {
          return { label: edge };
        }
        return edge;
      }
      /**
       * Detects whether the graph contains specified edge or not. No subgraphs are considered.
       * Complexity: O(1).
       */
      hasEdge(v, w, name) {
        var e = arguments.length === 1 ? edgeObjToId(this._isDirected, arguments[0]) : edgeArgsToId(this._isDirected, v, w, name);
        return Object.hasOwn(this._edgeLabels, e);
      }
      /**
       * Removes the specified edge from the graph. No subgraphs are considered.
       * Complexity: O(1).
       */
      removeEdge(v, w, name) {
        var e = arguments.length === 1 ? edgeObjToId(this._isDirected, arguments[0]) : edgeArgsToId(this._isDirected, v, w, name);
        var edge = this._edgeObjs[e];
        if (edge) {
          v = edge.v;
          w = edge.w;
          delete this._edgeLabels[e];
          delete this._edgeObjs[e];
          decrementOrRemoveEntry(this._preds[w], v);
          decrementOrRemoveEntry(this._sucs[v], w);
          delete this._in[w][e];
          delete this._out[v][e];
          this._edgeCount--;
        }
        return this;
      }
      /**
       * Return all edges that point to the node v. Optionally filters those edges down to just those
       * coming from node u. Behavior is undefined for undirected graphs - use nodeEdges instead.
       * Complexity: O(|E|).
       */
      inEdges(v, u) {
        var inV = this._in[v];
        if (inV) {
          var edges = Object.values(inV);
          if (!u) {
            return edges;
          }
          return edges.filter((edge) => edge.v === u);
        }
      }
      /**
       * Return all edges that are pointed at by node v. Optionally filters those edges down to just
       * those point to w. Behavior is undefined for undirected graphs - use nodeEdges instead.
       * Complexity: O(|E|).
       */
      outEdges(v, w) {
        var outV = this._out[v];
        if (outV) {
          var edges = Object.values(outV);
          if (!w) {
            return edges;
          }
          return edges.filter((edge) => edge.w === w);
        }
      }
      /**
       * Returns all edges to or from node v regardless of direction. Optionally filters those edges
       * down to just those between nodes v and w regardless of direction.
       * Complexity: O(|E|).
       */
      nodeEdges(v, w) {
        var inEdges = this.inEdges(v, w);
        if (inEdges) {
          return inEdges.concat(this.outEdges(v, w));
        }
      }
    };
    function incrementOrInitEntry(map, k) {
      if (map[k]) {
        map[k]++;
      } else {
        map[k] = 1;
      }
    }
    function decrementOrRemoveEntry(map, k) {
      if (!--map[k]) {
        delete map[k];
      }
    }
    function edgeArgsToId(isDirected, v_, w_, name) {
      var v = "" + v_;
      var w = "" + w_;
      if (!isDirected && v > w) {
        var tmp = v;
        v = w;
        w = tmp;
      }
      return v + EDGE_KEY_DELIM + w + EDGE_KEY_DELIM + (name === void 0 ? DEFAULT_EDGE_NAME : name);
    }
    function edgeArgsToObj(isDirected, v_, w_, name) {
      var v = "" + v_;
      var w = "" + w_;
      if (!isDirected && v > w) {
        var tmp = v;
        v = w;
        w = tmp;
      }
      var edgeObj = { v, w };
      if (name) {
        edgeObj.name = name;
      }
      return edgeObj;
    }
    function edgeObjToId(isDirected, edgeObj) {
      return edgeArgsToId(isDirected, edgeObj.v, edgeObj.w, edgeObj.name);
    }
    module.exports = Graph;
  }
});

// node_modules/@dagrejs/graphlib/lib/version.js
var require_version = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/version.js"(exports, module) {
    module.exports = "2.2.4";
  }
});

// node_modules/@dagrejs/graphlib/lib/index.js
var require_lib = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/index.js"(exports, module) {
    module.exports = {
      Graph: require_graph(),
      version: require_version()
    };
  }
});

// node_modules/@dagrejs/graphlib/lib/json.js
var require_json = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/json.js"(exports, module) {
    var Graph = require_graph();
    module.exports = {
      write,
      read
    };
    function write(g) {
      var json = {
        options: {
          directed: g.isDirected(),
          multigraph: g.isMultigraph(),
          compound: g.isCompound()
        },
        nodes: writeNodes(g),
        edges: writeEdges(g)
      };
      if (g.graph() !== void 0) {
        json.value = structuredClone(g.graph());
      }
      return json;
    }
    function writeNodes(g) {
      return g.nodes().map(function(v) {
        var nodeValue = g.node(v);
        var parent = g.parent(v);
        var node = { v };
        if (nodeValue !== void 0) {
          node.value = nodeValue;
        }
        if (parent !== void 0) {
          node.parent = parent;
        }
        return node;
      });
    }
    function writeEdges(g) {
      return g.edges().map(function(e) {
        var edgeValue = g.edge(e);
        var edge = { v: e.v, w: e.w };
        if (e.name !== void 0) {
          edge.name = e.name;
        }
        if (edgeValue !== void 0) {
          edge.value = edgeValue;
        }
        return edge;
      });
    }
    function read(json) {
      var g = new Graph(json.options).setGraph(json.value);
      json.nodes.forEach(function(entry) {
        g.setNode(entry.v, entry.value);
        if (entry.parent) {
          g.setParent(entry.v, entry.parent);
        }
      });
      json.edges.forEach(function(entry) {
        g.setEdge({ v: entry.v, w: entry.w, name: entry.name }, entry.value);
      });
      return g;
    }
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/components.js
var require_components = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/components.js"(exports, module) {
    module.exports = components;
    function components(g) {
      var visited = {};
      var cmpts = [];
      var cmpt;
      function dfs(v) {
        if (Object.hasOwn(visited, v)) return;
        visited[v] = true;
        cmpt.push(v);
        g.successors(v).forEach(dfs);
        g.predecessors(v).forEach(dfs);
      }
      g.nodes().forEach(function(v) {
        cmpt = [];
        dfs(v);
        if (cmpt.length) {
          cmpts.push(cmpt);
        }
      });
      return cmpts;
    }
  }
});

// node_modules/@dagrejs/graphlib/lib/data/priority-queue.js
var require_priority_queue = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/data/priority-queue.js"(exports, module) {
    var PriorityQueue = class {
      _arr = [];
      _keyIndices = {};
      /**
       * Returns the number of elements in the queue. Takes `O(1)` time.
       */
      size() {
        return this._arr.length;
      }
      /**
       * Returns the keys that are in the queue. Takes `O(n)` time.
       */
      keys() {
        return this._arr.map(function(x) {
          return x.key;
        });
      }
      /**
       * Returns `true` if **key** is in the queue and `false` if not.
       */
      has(key) {
        return Object.hasOwn(this._keyIndices, key);
      }
      /**
       * Returns the priority for **key**. If **key** is not present in the queue
       * then this function returns `undefined`. Takes `O(1)` time.
       *
       * @param {Object} key
       */
      priority(key) {
        var index = this._keyIndices[key];
        if (index !== void 0) {
          return this._arr[index].priority;
        }
      }
      /**
       * Returns the key for the minimum element in this queue. If the queue is
       * empty this function throws an Error. Takes `O(1)` time.
       */
      min() {
        if (this.size() === 0) {
          throw new Error("Queue underflow");
        }
        return this._arr[0].key;
      }
      /**
       * Inserts a new key into the priority queue. If the key already exists in
       * the queue this function returns `false`; otherwise it will return `true`.
       * Takes `O(n)` time.
       *
       * @param {Object} key the key to add
       * @param {Number} priority the initial priority for the key
       */
      add(key, priority) {
        var keyIndices = this._keyIndices;
        key = String(key);
        if (!Object.hasOwn(keyIndices, key)) {
          var arr = this._arr;
          var index = arr.length;
          keyIndices[key] = index;
          arr.push({ key, priority });
          this._decrease(index);
          return true;
        }
        return false;
      }
      /**
       * Removes and returns the smallest key in the queue. Takes `O(log n)` time.
       */
      removeMin() {
        this._swap(0, this._arr.length - 1);
        var min = this._arr.pop();
        delete this._keyIndices[min.key];
        this._heapify(0);
        return min.key;
      }
      /**
       * Decreases the priority for **key** to **priority**. If the new priority is
       * greater than the previous priority, this function will throw an Error.
       *
       * @param {Object} key the key for which to raise priority
       * @param {Number} priority the new priority for the key
       */
      decrease(key, priority) {
        var index = this._keyIndices[key];
        if (priority > this._arr[index].priority) {
          throw new Error("New priority is greater than current priority. Key: " + key + " Old: " + this._arr[index].priority + " New: " + priority);
        }
        this._arr[index].priority = priority;
        this._decrease(index);
      }
      _heapify(i) {
        var arr = this._arr;
        var l = 2 * i;
        var r = l + 1;
        var largest = i;
        if (l < arr.length) {
          largest = arr[l].priority < arr[largest].priority ? l : largest;
          if (r < arr.length) {
            largest = arr[r].priority < arr[largest].priority ? r : largest;
          }
          if (largest !== i) {
            this._swap(i, largest);
            this._heapify(largest);
          }
        }
      }
      _decrease(index) {
        var arr = this._arr;
        var priority = arr[index].priority;
        var parent;
        while (index !== 0) {
          parent = index >> 1;
          if (arr[parent].priority < priority) {
            break;
          }
          this._swap(index, parent);
          index = parent;
        }
      }
      _swap(i, j) {
        var arr = this._arr;
        var keyIndices = this._keyIndices;
        var origArrI = arr[i];
        var origArrJ = arr[j];
        arr[i] = origArrJ;
        arr[j] = origArrI;
        keyIndices[origArrJ.key] = i;
        keyIndices[origArrI.key] = j;
      }
    };
    module.exports = PriorityQueue;
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/dijkstra.js
var require_dijkstra = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/dijkstra.js"(exports, module) {
    var PriorityQueue = require_priority_queue();
    module.exports = dijkstra;
    var DEFAULT_WEIGHT_FUNC = () => 1;
    function dijkstra(g, source, weightFn, edgeFn) {
      return runDijkstra(
        g,
        String(source),
        weightFn || DEFAULT_WEIGHT_FUNC,
        edgeFn || function(v) {
          return g.outEdges(v);
        }
      );
    }
    function runDijkstra(g, source, weightFn, edgeFn) {
      var results = {};
      var pq = new PriorityQueue();
      var v, vEntry;
      var updateNeighbors = function(edge) {
        var w = edge.v !== v ? edge.v : edge.w;
        var wEntry = results[w];
        var weight = weightFn(edge);
        var distance = vEntry.distance + weight;
        if (weight < 0) {
          throw new Error("dijkstra does not allow negative edge weights. Bad edge: " + edge + " Weight: " + weight);
        }
        if (distance < wEntry.distance) {
          wEntry.distance = distance;
          wEntry.predecessor = v;
          pq.decrease(w, distance);
        }
      };
      g.nodes().forEach(function(v2) {
        var distance = v2 === source ? 0 : Number.POSITIVE_INFINITY;
        results[v2] = { distance };
        pq.add(v2, distance);
      });
      while (pq.size() > 0) {
        v = pq.removeMin();
        vEntry = results[v];
        if (vEntry.distance === Number.POSITIVE_INFINITY) {
          break;
        }
        edgeFn(v).forEach(updateNeighbors);
      }
      return results;
    }
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/dijkstra-all.js
var require_dijkstra_all = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/dijkstra-all.js"(exports, module) {
    var dijkstra = require_dijkstra();
    module.exports = dijkstraAll;
    function dijkstraAll(g, weightFunc, edgeFunc) {
      return g.nodes().reduce(function(acc, v) {
        acc[v] = dijkstra(g, v, weightFunc, edgeFunc);
        return acc;
      }, {});
    }
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/tarjan.js
var require_tarjan = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/tarjan.js"(exports, module) {
    module.exports = tarjan;
    function tarjan(g) {
      var index = 0;
      var stack = [];
      var visited = {};
      var results = [];
      function dfs(v) {
        var entry = visited[v] = {
          onStack: true,
          lowlink: index,
          index: index++
        };
        stack.push(v);
        g.successors(v).forEach(function(w2) {
          if (!Object.hasOwn(visited, w2)) {
            dfs(w2);
            entry.lowlink = Math.min(entry.lowlink, visited[w2].lowlink);
          } else if (visited[w2].onStack) {
            entry.lowlink = Math.min(entry.lowlink, visited[w2].index);
          }
        });
        if (entry.lowlink === entry.index) {
          var cmpt = [];
          var w;
          do {
            w = stack.pop();
            visited[w].onStack = false;
            cmpt.push(w);
          } while (v !== w);
          results.push(cmpt);
        }
      }
      g.nodes().forEach(function(v) {
        if (!Object.hasOwn(visited, v)) {
          dfs(v);
        }
      });
      return results;
    }
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/find-cycles.js
var require_find_cycles = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/find-cycles.js"(exports, module) {
    var tarjan = require_tarjan();
    module.exports = findCycles;
    function findCycles(g) {
      return tarjan(g).filter(function(cmpt) {
        return cmpt.length > 1 || cmpt.length === 1 && g.hasEdge(cmpt[0], cmpt[0]);
      });
    }
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/floyd-warshall.js
var require_floyd_warshall = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/floyd-warshall.js"(exports, module) {
    module.exports = floydWarshall;
    var DEFAULT_WEIGHT_FUNC = () => 1;
    function floydWarshall(g, weightFn, edgeFn) {
      return runFloydWarshall(
        g,
        weightFn || DEFAULT_WEIGHT_FUNC,
        edgeFn || function(v) {
          return g.outEdges(v);
        }
      );
    }
    function runFloydWarshall(g, weightFn, edgeFn) {
      var results = {};
      var nodes = g.nodes();
      nodes.forEach(function(v) {
        results[v] = {};
        results[v][v] = { distance: 0 };
        nodes.forEach(function(w) {
          if (v !== w) {
            results[v][w] = { distance: Number.POSITIVE_INFINITY };
          }
        });
        edgeFn(v).forEach(function(edge) {
          var w = edge.v === v ? edge.w : edge.v;
          var d = weightFn(edge);
          results[v][w] = { distance: d, predecessor: v };
        });
      });
      nodes.forEach(function(k) {
        var rowK = results[k];
        nodes.forEach(function(i) {
          var rowI = results[i];
          nodes.forEach(function(j) {
            var ik = rowI[k];
            var kj = rowK[j];
            var ij = rowI[j];
            var altDistance = ik.distance + kj.distance;
            if (altDistance < ij.distance) {
              ij.distance = altDistance;
              ij.predecessor = kj.predecessor;
            }
          });
        });
      });
      return results;
    }
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/topsort.js
var require_topsort = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/topsort.js"(exports, module) {
    function topsort(g) {
      var visited = {};
      var stack = {};
      var results = [];
      function visit(node) {
        if (Object.hasOwn(stack, node)) {
          throw new CycleException();
        }
        if (!Object.hasOwn(visited, node)) {
          stack[node] = true;
          visited[node] = true;
          g.predecessors(node).forEach(visit);
          delete stack[node];
          results.push(node);
        }
      }
      g.sinks().forEach(visit);
      if (Object.keys(visited).length !== g.nodeCount()) {
        throw new CycleException();
      }
      return results;
    }
    var CycleException = class extends Error {
      constructor() {
        super(...arguments);
      }
    };
    module.exports = topsort;
    topsort.CycleException = CycleException;
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/is-acyclic.js
var require_is_acyclic = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/is-acyclic.js"(exports, module) {
    var topsort = require_topsort();
    module.exports = isAcyclic;
    function isAcyclic(g) {
      try {
        topsort(g);
      } catch (e) {
        if (e instanceof topsort.CycleException) {
          return false;
        }
        throw e;
      }
      return true;
    }
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/dfs.js
var require_dfs = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/dfs.js"(exports, module) {
    module.exports = dfs;
    function dfs(g, vs, order) {
      if (!Array.isArray(vs)) {
        vs = [vs];
      }
      var navigation = g.isDirected() ? (v) => g.successors(v) : (v) => g.neighbors(v);
      var orderFunc = order === "post" ? postOrderDfs : preOrderDfs;
      var acc = [];
      var visited = {};
      vs.forEach((v) => {
        if (!g.hasNode(v)) {
          throw new Error("Graph does not have node: " + v);
        }
        orderFunc(v, navigation, visited, acc);
      });
      return acc;
    }
    function postOrderDfs(v, navigation, visited, acc) {
      var stack = [[v, false]];
      while (stack.length > 0) {
        var curr = stack.pop();
        if (curr[1]) {
          acc.push(curr[0]);
        } else {
          if (!Object.hasOwn(visited, curr[0])) {
            visited[curr[0]] = true;
            stack.push([curr[0], true]);
            forEachRight(navigation(curr[0]), (w) => stack.push([w, false]));
          }
        }
      }
    }
    function preOrderDfs(v, navigation, visited, acc) {
      var stack = [v];
      while (stack.length > 0) {
        var curr = stack.pop();
        if (!Object.hasOwn(visited, curr)) {
          visited[curr] = true;
          acc.push(curr);
          forEachRight(navigation(curr), (w) => stack.push(w));
        }
      }
    }
    function forEachRight(array, iteratee) {
      var length = array.length;
      while (length--) {
        iteratee(array[length], length, array);
      }
      return array;
    }
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/postorder.js
var require_postorder = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/postorder.js"(exports, module) {
    var dfs = require_dfs();
    module.exports = postorder;
    function postorder(g, vs) {
      return dfs(g, vs, "post");
    }
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/preorder.js
var require_preorder = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/preorder.js"(exports, module) {
    var dfs = require_dfs();
    module.exports = preorder;
    function preorder(g, vs) {
      return dfs(g, vs, "pre");
    }
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/prim.js
var require_prim = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/prim.js"(exports, module) {
    var Graph = require_graph();
    var PriorityQueue = require_priority_queue();
    module.exports = prim;
    function prim(g, weightFunc) {
      var result = new Graph();
      var parents = {};
      var pq = new PriorityQueue();
      var v;
      function updateNeighbors(edge) {
        var w = edge.v === v ? edge.w : edge.v;
        var pri = pq.priority(w);
        if (pri !== void 0) {
          var edgeWeight = weightFunc(edge);
          if (edgeWeight < pri) {
            parents[w] = v;
            pq.decrease(w, edgeWeight);
          }
        }
      }
      if (g.nodeCount() === 0) {
        return result;
      }
      g.nodes().forEach(function(v2) {
        pq.add(v2, Number.POSITIVE_INFINITY);
        result.setNode(v2);
      });
      pq.decrease(g.nodes()[0], 0);
      var init = false;
      while (pq.size() > 0) {
        v = pq.removeMin();
        if (Object.hasOwn(parents, v)) {
          result.setEdge(v, parents[v]);
        } else if (init) {
          throw new Error("Input graph is not connected: " + g);
        } else {
          init = true;
        }
        g.nodeEdges(v).forEach(updateNeighbors);
      }
      return result;
    }
  }
});

// node_modules/@dagrejs/graphlib/lib/alg/index.js
var require_alg = __commonJS({
  "node_modules/@dagrejs/graphlib/lib/alg/index.js"(exports, module) {
    module.exports = {
      components: require_components(),
      dijkstra: require_dijkstra(),
      dijkstraAll: require_dijkstra_all(),
      findCycles: require_find_cycles(),
      floydWarshall: require_floyd_warshall(),
      isAcyclic: require_is_acyclic(),
      postorder: require_postorder(),
      preorder: require_preorder(),
      prim: require_prim(),
      tarjan: require_tarjan(),
      topsort: require_topsort()
    };
  }
});

// node_modules/@dagrejs/graphlib/index.js
var require_graphlib = __commonJS({
  "node_modules/@dagrejs/graphlib/index.js"(exports, module) {
    var lib = require_lib();
    module.exports = {
      Graph: lib.Graph,
      json: require_json(),
      alg: require_alg(),
      version: lib.version
    };
  }
});

// node_modules/@dagrejs/dagre/lib/data/list.js
var require_list = __commonJS({
  "node_modules/@dagrejs/dagre/lib/data/list.js"(exports, module) {
    var List = class {
      constructor() {
        let sentinel = {};
        sentinel._next = sentinel._prev = sentinel;
        this._sentinel = sentinel;
      }
      dequeue() {
        let sentinel = this._sentinel;
        let entry = sentinel._prev;
        if (entry !== sentinel) {
          unlink(entry);
          return entry;
        }
      }
      enqueue(entry) {
        let sentinel = this._sentinel;
        if (entry._prev && entry._next) {
          unlink(entry);
        }
        entry._next = sentinel._next;
        sentinel._next._prev = entry;
        sentinel._next = entry;
        entry._prev = sentinel;
      }
      toString() {
        let strs = [];
        let sentinel = this._sentinel;
        let curr = sentinel._prev;
        while (curr !== sentinel) {
          strs.push(JSON.stringify(curr, filterOutLinks));
          curr = curr._prev;
        }
        return "[" + strs.join(", ") + "]";
      }
    };
    function unlink(entry) {
      entry._prev._next = entry._next;
      entry._next._prev = entry._prev;
      delete entry._next;
      delete entry._prev;
    }
    function filterOutLinks(k, v) {
      if (k !== "_next" && k !== "_prev") {
        return v;
      }
    }
    module.exports = List;
  }
});

// node_modules/@dagrejs/dagre/lib/greedy-fas.js
var require_greedy_fas = __commonJS({
  "node_modules/@dagrejs/dagre/lib/greedy-fas.js"(exports, module) {
    var Graph = require_graphlib().Graph;
    var List = require_list();
    module.exports = greedyFAS;
    var DEFAULT_WEIGHT_FN = () => 1;
    function greedyFAS(g, weightFn) {
      if (g.nodeCount() <= 1) {
        return [];
      }
      let state = buildState(g, weightFn || DEFAULT_WEIGHT_FN);
      let results = doGreedyFAS(state.graph, state.buckets, state.zeroIdx);
      return results.flatMap((e) => g.outEdges(e.v, e.w));
    }
    function doGreedyFAS(g, buckets, zeroIdx) {
      let results = [];
      let sources = buckets[buckets.length - 1];
      let sinks = buckets[0];
      let entry;
      while (g.nodeCount()) {
        while (entry = sinks.dequeue()) {
          removeNode(g, buckets, zeroIdx, entry);
        }
        while (entry = sources.dequeue()) {
          removeNode(g, buckets, zeroIdx, entry);
        }
        if (g.nodeCount()) {
          for (let i = buckets.length - 2; i > 0; --i) {
            entry = buckets[i].dequeue();
            if (entry) {
              results = results.concat(removeNode(g, buckets, zeroIdx, entry, true));
              break;
            }
          }
        }
      }
      return results;
    }
    function removeNode(g, buckets, zeroIdx, entry, collectPredecessors) {
      let results = collectPredecessors ? [] : void 0;
      g.inEdges(entry.v).forEach((edge) => {
        let weight = g.edge(edge);
        let uEntry = g.node(edge.v);
        if (collectPredecessors) {
          results.push({ v: edge.v, w: edge.w });
        }
        uEntry.out -= weight;
        assignBucket(buckets, zeroIdx, uEntry);
      });
      g.outEdges(entry.v).forEach((edge) => {
        let weight = g.edge(edge);
        let w = edge.w;
        let wEntry = g.node(w);
        wEntry["in"] -= weight;
        assignBucket(buckets, zeroIdx, wEntry);
      });
      g.removeNode(entry.v);
      return results;
    }
    function buildState(g, weightFn) {
      let fasGraph = new Graph();
      let maxIn = 0;
      let maxOut = 0;
      g.nodes().forEach((v) => {
        fasGraph.setNode(v, { v, "in": 0, out: 0 });
      });
      g.edges().forEach((e) => {
        let prevWeight = fasGraph.edge(e.v, e.w) || 0;
        let weight = weightFn(e);
        let edgeWeight = prevWeight + weight;
        fasGraph.setEdge(e.v, e.w, edgeWeight);
        maxOut = Math.max(maxOut, fasGraph.node(e.v).out += weight);
        maxIn = Math.max(maxIn, fasGraph.node(e.w)["in"] += weight);
      });
      let buckets = range(maxOut + maxIn + 3).map(() => new List());
      let zeroIdx = maxIn + 1;
      fasGraph.nodes().forEach((v) => {
        assignBucket(buckets, zeroIdx, fasGraph.node(v));
      });
      return { graph: fasGraph, buckets, zeroIdx };
    }
    function assignBucket(buckets, zeroIdx, entry) {
      if (!entry.out) {
        buckets[0].enqueue(entry);
      } else if (!entry["in"]) {
        buckets[buckets.length - 1].enqueue(entry);
      } else {
        buckets[entry.out - entry["in"] + zeroIdx].enqueue(entry);
      }
    }
    function range(limit) {
      const range2 = [];
      for (let i = 0; i < limit; i++) {
        range2.push(i);
      }
      return range2;
    }
  }
});

// node_modules/@dagrejs/dagre/lib/util.js
var require_util = __commonJS({
  "node_modules/@dagrejs/dagre/lib/util.js"(exports, module) {
    var Graph = require_graphlib().Graph;
    module.exports = {
      addBorderNode,
      addDummyNode,
      applyWithChunking,
      asNonCompoundGraph,
      buildLayerMatrix,
      intersectRect,
      mapValues,
      maxRank,
      normalizeRanks,
      notime,
      partition,
      pick,
      predecessorWeights,
      range,
      removeEmptyRanks,
      simplify: simplify2,
      successorWeights,
      time,
      uniqueId,
      zipObject
    };
    function addDummyNode(g, type, attrs, name) {
      var v = name;
      while (g.hasNode(v)) {
        v = uniqueId(name);
      }
      attrs.dummy = type;
      g.setNode(v, attrs);
      return v;
    }
    function simplify2(g) {
      let simplified = new Graph().setGraph(g.graph());
      g.nodes().forEach((v) => simplified.setNode(v, g.node(v)));
      g.edges().forEach((e) => {
        let simpleLabel = simplified.edge(e.v, e.w) || { weight: 0, minlen: 1 };
        let label = g.edge(e);
        simplified.setEdge(e.v, e.w, {
          weight: simpleLabel.weight + label.weight,
          minlen: Math.max(simpleLabel.minlen, label.minlen)
        });
      });
      return simplified;
    }
    function asNonCompoundGraph(g) {
      let simplified = new Graph({ multigraph: g.isMultigraph() }).setGraph(g.graph());
      g.nodes().forEach((v) => {
        if (!g.children(v).length) {
          simplified.setNode(v, g.node(v));
        }
      });
      g.edges().forEach((e) => {
        simplified.setEdge(e, g.edge(e));
      });
      return simplified;
    }
    function successorWeights(g) {
      let weightMap = g.nodes().map((v) => {
        let sucs = {};
        g.outEdges(v).forEach((e) => {
          sucs[e.w] = (sucs[e.w] || 0) + g.edge(e).weight;
        });
        return sucs;
      });
      return zipObject(g.nodes(), weightMap);
    }
    function predecessorWeights(g) {
      let weightMap = g.nodes().map((v) => {
        let preds = {};
        g.inEdges(v).forEach((e) => {
          preds[e.v] = (preds[e.v] || 0) + g.edge(e).weight;
        });
        return preds;
      });
      return zipObject(g.nodes(), weightMap);
    }
    function intersectRect(rect, point) {
      let x = rect.x;
      let y = rect.y;
      let dx = point.x - x;
      let dy = point.y - y;
      let w = rect.width / 2;
      let h = rect.height / 2;
      if (!dx && !dy) {
        throw new Error("Not possible to find intersection inside of the rectangle");
      }
      let sx, sy;
      if (Math.abs(dy) * w > Math.abs(dx) * h) {
        if (dy < 0) {
          h = -h;
        }
        sx = h * dx / dy;
        sy = h;
      } else {
        if (dx < 0) {
          w = -w;
        }
        sx = w;
        sy = w * dy / dx;
      }
      return { x: x + sx, y: y + sy };
    }
    function buildLayerMatrix(g) {
      let layering = range(maxRank(g) + 1).map(() => []);
      g.nodes().forEach((v) => {
        let node = g.node(v);
        let rank = node.rank;
        if (rank !== void 0) {
          layering[rank][node.order] = v;
        }
      });
      return layering;
    }
    function normalizeRanks(g) {
      let nodeRanks = g.nodes().map((v) => {
        let rank = g.node(v).rank;
        if (rank === void 0) {
          return Number.MAX_VALUE;
        }
        return rank;
      });
      let min = applyWithChunking(Math.min, nodeRanks);
      g.nodes().forEach((v) => {
        let node = g.node(v);
        if (Object.hasOwn(node, "rank")) {
          node.rank -= min;
        }
      });
    }
    function removeEmptyRanks(g) {
      let nodeRanks = g.nodes().map((v) => g.node(v).rank);
      let offset = applyWithChunking(Math.min, nodeRanks);
      let layers = [];
      g.nodes().forEach((v) => {
        let rank = g.node(v).rank - offset;
        if (!layers[rank]) {
          layers[rank] = [];
        }
        layers[rank].push(v);
      });
      let delta = 0;
      let nodeRankFactor = g.graph().nodeRankFactor;
      Array.from(layers).forEach((vs, i) => {
        if (vs === void 0 && i % nodeRankFactor !== 0) {
          --delta;
        } else if (vs !== void 0 && delta) {
          vs.forEach((v) => g.node(v).rank += delta);
        }
      });
    }
    function addBorderNode(g, prefix, rank, order) {
      let node = {
        width: 0,
        height: 0
      };
      if (arguments.length >= 4) {
        node.rank = rank;
        node.order = order;
      }
      return addDummyNode(g, "border", node, prefix);
    }
    function splitToChunks(array, chunkSize = CHUNKING_THRESHOLD) {
      const chunks = [];
      for (let i = 0; i < array.length; i += chunkSize) {
        const chunk = array.slice(i, i + chunkSize);
        chunks.push(chunk);
      }
      return chunks;
    }
    var CHUNKING_THRESHOLD = 65535;
    function applyWithChunking(fn, argsArray) {
      if (argsArray.length > CHUNKING_THRESHOLD) {
        const chunks = splitToChunks(argsArray);
        return fn.apply(null, chunks.map((chunk) => fn.apply(null, chunk)));
      } else {
        return fn.apply(null, argsArray);
      }
    }
    function maxRank(g) {
      const nodes = g.nodes();
      const nodeRanks = nodes.map((v) => {
        let rank = g.node(v).rank;
        if (rank === void 0) {
          return Number.MIN_VALUE;
        }
        return rank;
      });
      return applyWithChunking(Math.max, nodeRanks);
    }
    function partition(collection, fn) {
      let result = { lhs: [], rhs: [] };
      collection.forEach((value) => {
        if (fn(value)) {
          result.lhs.push(value);
        } else {
          result.rhs.push(value);
        }
      });
      return result;
    }
    function time(name, fn) {
      let start = Date.now();
      try {
        return fn();
      } finally {
        console.log(name + " time: " + (Date.now() - start) + "ms");
      }
    }
    function notime(name, fn) {
      return fn();
    }
    var idCounter = 0;
    function uniqueId(prefix) {
      var id = ++idCounter;
      return prefix + ("" + id);
    }
    function range(start, limit, step = 1) {
      if (limit == null) {
        limit = start;
        start = 0;
      }
      let endCon = (i) => i < limit;
      if (step < 0) {
        endCon = (i) => limit < i;
      }
      const range2 = [];
      for (let i = start; endCon(i); i += step) {
        range2.push(i);
      }
      return range2;
    }
    function pick(source, keys) {
      const dest = {};
      for (const key of keys) {
        if (source[key] !== void 0) {
          dest[key] = source[key];
        }
      }
      return dest;
    }
    function mapValues(obj, funcOrProp) {
      let func = funcOrProp;
      if (typeof funcOrProp === "string") {
        func = (val) => val[funcOrProp];
      }
      return Object.entries(obj).reduce((acc, [k, v]) => {
        acc[k] = func(v, k);
        return acc;
      }, {});
    }
    function zipObject(props, values) {
      return props.reduce((acc, key, i) => {
        acc[key] = values[i];
        return acc;
      }, {});
    }
  }
});

// node_modules/@dagrejs/dagre/lib/acyclic.js
var require_acyclic = __commonJS({
  "node_modules/@dagrejs/dagre/lib/acyclic.js"(exports, module) {
    var greedyFAS = require_greedy_fas();
    var uniqueId = require_util().uniqueId;
    module.exports = {
      run,
      undo
    };
    function run(g) {
      let fas = g.graph().acyclicer === "greedy" ? greedyFAS(g, weightFn(g)) : dfsFAS(g);
      fas.forEach((e) => {
        let label = g.edge(e);
        g.removeEdge(e);
        label.forwardName = e.name;
        label.reversed = true;
        g.setEdge(e.w, e.v, label, uniqueId("rev"));
      });
      function weightFn(g2) {
        return (e) => {
          return g2.edge(e).weight;
        };
      }
    }
    function dfsFAS(g) {
      let fas = [];
      let stack = {};
      let visited = {};
      function dfs(v) {
        if (Object.hasOwn(visited, v)) {
          return;
        }
        visited[v] = true;
        stack[v] = true;
        g.outEdges(v).forEach((e) => {
          if (Object.hasOwn(stack, e.w)) {
            fas.push(e);
          } else {
            dfs(e.w);
          }
        });
        delete stack[v];
      }
      g.nodes().forEach(dfs);
      return fas;
    }
    function undo(g) {
      g.edges().forEach((e) => {
        let label = g.edge(e);
        if (label.reversed) {
          g.removeEdge(e);
          let forwardName = label.forwardName;
          delete label.reversed;
          delete label.forwardName;
          g.setEdge(e.w, e.v, label, forwardName);
        }
      });
    }
  }
});

// node_modules/@dagrejs/dagre/lib/normalize.js
var require_normalize = __commonJS({
  "node_modules/@dagrejs/dagre/lib/normalize.js"(exports, module) {
    var util = require_util();
    module.exports = {
      run,
      undo
    };
    function run(g) {
      g.graph().dummyChains = [];
      g.edges().forEach((edge) => normalizeEdge(g, edge));
    }
    function normalizeEdge(g, e) {
      let v = e.v;
      let vRank = g.node(v).rank;
      let w = e.w;
      let wRank = g.node(w).rank;
      let name = e.name;
      let edgeLabel = g.edge(e);
      let labelRank = edgeLabel.labelRank;
      if (wRank === vRank + 1) return;
      g.removeEdge(e);
      let dummy, attrs, i;
      for (i = 0, ++vRank; vRank < wRank; ++i, ++vRank) {
        edgeLabel.points = [];
        attrs = {
          width: 0,
          height: 0,
          edgeLabel,
          edgeObj: e,
          rank: vRank
        };
        dummy = util.addDummyNode(g, "edge", attrs, "_d");
        if (vRank === labelRank) {
          attrs.width = edgeLabel.width;
          attrs.height = edgeLabel.height;
          attrs.dummy = "edge-label";
          attrs.labelpos = edgeLabel.labelpos;
        }
        g.setEdge(v, dummy, { weight: edgeLabel.weight }, name);
        if (i === 0) {
          g.graph().dummyChains.push(dummy);
        }
        v = dummy;
      }
      g.setEdge(v, w, { weight: edgeLabel.weight }, name);
    }
    function undo(g) {
      g.graph().dummyChains.forEach((v) => {
        let node = g.node(v);
        let origLabel = node.edgeLabel;
        let w;
        g.setEdge(node.edgeObj, origLabel);
        while (node.dummy) {
          w = g.successors(v)[0];
          g.removeNode(v);
          origLabel.points.push({ x: node.x, y: node.y });
          if (node.dummy === "edge-label") {
            origLabel.x = node.x;
            origLabel.y = node.y;
            origLabel.width = node.width;
            origLabel.height = node.height;
          }
          v = w;
          node = g.node(v);
        }
      });
    }
  }
});

// node_modules/@dagrejs/dagre/lib/rank/util.js
var require_util2 = __commonJS({
  "node_modules/@dagrejs/dagre/lib/rank/util.js"(exports, module) {
    var { applyWithChunking } = require_util();
    module.exports = {
      longestPath,
      slack
    };
    function longestPath(g) {
      var visited = {};
      function dfs(v) {
        var label = g.node(v);
        if (Object.hasOwn(visited, v)) {
          return label.rank;
        }
        visited[v] = true;
        let outEdgesMinLens = g.outEdges(v).map((e) => {
          if (e == null) {
            return Number.POSITIVE_INFINITY;
          }
          return dfs(e.w) - g.edge(e).minlen;
        });
        var rank = applyWithChunking(Math.min, outEdgesMinLens);
        if (rank === Number.POSITIVE_INFINITY) {
          rank = 0;
        }
        return label.rank = rank;
      }
      g.sources().forEach(dfs);
    }
    function slack(g, e) {
      return g.node(e.w).rank - g.node(e.v).rank - g.edge(e).minlen;
    }
  }
});

// node_modules/@dagrejs/dagre/lib/rank/feasible-tree.js
var require_feasible_tree = __commonJS({
  "node_modules/@dagrejs/dagre/lib/rank/feasible-tree.js"(exports, module) {
    var Graph = require_graphlib().Graph;
    var slack = require_util2().slack;
    module.exports = feasibleTree;
    function feasibleTree(g) {
      var t = new Graph({ directed: false });
      var start = g.nodes()[0];
      var size = g.nodeCount();
      t.setNode(start, {});
      var edge, delta;
      while (tightTree(t, g) < size) {
        edge = findMinSlackEdge(t, g);
        delta = t.hasNode(edge.v) ? slack(g, edge) : -slack(g, edge);
        shiftRanks(t, g, delta);
      }
      return t;
    }
    function tightTree(t, g) {
      function dfs(v) {
        g.nodeEdges(v).forEach((e) => {
          var edgeV = e.v, w = v === edgeV ? e.w : edgeV;
          if (!t.hasNode(w) && !slack(g, e)) {
            t.setNode(w, {});
            t.setEdge(v, w, {});
            dfs(w);
          }
        });
      }
      t.nodes().forEach(dfs);
      return t.nodeCount();
    }
    function findMinSlackEdge(t, g) {
      const edges = g.edges();
      return edges.reduce((acc, edge) => {
        let edgeSlack = Number.POSITIVE_INFINITY;
        if (t.hasNode(edge.v) !== t.hasNode(edge.w)) {
          edgeSlack = slack(g, edge);
        }
        if (edgeSlack < acc[0]) {
          return [edgeSlack, edge];
        }
        return acc;
      }, [Number.POSITIVE_INFINITY, null])[1];
    }
    function shiftRanks(t, g, delta) {
      t.nodes().forEach((v) => g.node(v).rank += delta);
    }
  }
});

// node_modules/@dagrejs/dagre/lib/rank/network-simplex.js
var require_network_simplex = __commonJS({
  "node_modules/@dagrejs/dagre/lib/rank/network-simplex.js"(exports, module) {
    var feasibleTree = require_feasible_tree();
    var slack = require_util2().slack;
    var initRank = require_util2().longestPath;
    var preorder = require_graphlib().alg.preorder;
    var postorder = require_graphlib().alg.postorder;
    var simplify2 = require_util().simplify;
    module.exports = networkSimplex;
    networkSimplex.initLowLimValues = initLowLimValues;
    networkSimplex.initCutValues = initCutValues;
    networkSimplex.calcCutValue = calcCutValue;
    networkSimplex.leaveEdge = leaveEdge;
    networkSimplex.enterEdge = enterEdge;
    networkSimplex.exchangeEdges = exchangeEdges;
    function networkSimplex(g) {
      g = simplify2(g);
      initRank(g);
      var t = feasibleTree(g);
      initLowLimValues(t);
      initCutValues(t, g);
      var e, f;
      while (e = leaveEdge(t)) {
        f = enterEdge(t, g, e);
        exchangeEdges(t, g, e, f);
      }
    }
    function initCutValues(t, g) {
      var vs = postorder(t, t.nodes());
      vs = vs.slice(0, vs.length - 1);
      vs.forEach((v) => assignCutValue(t, g, v));
    }
    function assignCutValue(t, g, child) {
      var childLab = t.node(child);
      var parent = childLab.parent;
      t.edge(child, parent).cutvalue = calcCutValue(t, g, child);
    }
    function calcCutValue(t, g, child) {
      var childLab = t.node(child);
      var parent = childLab.parent;
      var childIsTail = true;
      var graphEdge = g.edge(child, parent);
      var cutValue = 0;
      if (!graphEdge) {
        childIsTail = false;
        graphEdge = g.edge(parent, child);
      }
      cutValue = graphEdge.weight;
      g.nodeEdges(child).forEach((e) => {
        var isOutEdge = e.v === child, other = isOutEdge ? e.w : e.v;
        if (other !== parent) {
          var pointsToHead = isOutEdge === childIsTail, otherWeight = g.edge(e).weight;
          cutValue += pointsToHead ? otherWeight : -otherWeight;
          if (isTreeEdge(t, child, other)) {
            var otherCutValue = t.edge(child, other).cutvalue;
            cutValue += pointsToHead ? -otherCutValue : otherCutValue;
          }
        }
      });
      return cutValue;
    }
    function initLowLimValues(tree, root) {
      if (arguments.length < 2) {
        root = tree.nodes()[0];
      }
      dfsAssignLowLim(tree, {}, 1, root);
    }
    function dfsAssignLowLim(tree, visited, nextLim, v, parent) {
      var low = nextLim;
      var label = tree.node(v);
      visited[v] = true;
      tree.neighbors(v).forEach((w) => {
        if (!Object.hasOwn(visited, w)) {
          nextLim = dfsAssignLowLim(tree, visited, nextLim, w, v);
        }
      });
      label.low = low;
      label.lim = nextLim++;
      if (parent) {
        label.parent = parent;
      } else {
        delete label.parent;
      }
      return nextLim;
    }
    function leaveEdge(tree) {
      return tree.edges().find((e) => tree.edge(e).cutvalue < 0);
    }
    function enterEdge(t, g, edge) {
      var v = edge.v;
      var w = edge.w;
      if (!g.hasEdge(v, w)) {
        v = edge.w;
        w = edge.v;
      }
      var vLabel = t.node(v);
      var wLabel = t.node(w);
      var tailLabel = vLabel;
      var flip = false;
      if (vLabel.lim > wLabel.lim) {
        tailLabel = wLabel;
        flip = true;
      }
      var candidates = g.edges().filter((edge2) => {
        return flip === isDescendant(t, t.node(edge2.v), tailLabel) && flip !== isDescendant(t, t.node(edge2.w), tailLabel);
      });
      return candidates.reduce((acc, edge2) => {
        if (slack(g, edge2) < slack(g, acc)) {
          return edge2;
        }
        return acc;
      });
    }
    function exchangeEdges(t, g, e, f) {
      var v = e.v;
      var w = e.w;
      t.removeEdge(v, w);
      t.setEdge(f.v, f.w, {});
      initLowLimValues(t);
      initCutValues(t, g);
      updateRanks(t, g);
    }
    function updateRanks(t, g) {
      var root = t.nodes().find((v) => !g.node(v).parent);
      var vs = preorder(t, root);
      vs = vs.slice(1);
      vs.forEach((v) => {
        var parent = t.node(v).parent, edge = g.edge(v, parent), flipped = false;
        if (!edge) {
          edge = g.edge(parent, v);
          flipped = true;
        }
        g.node(v).rank = g.node(parent).rank + (flipped ? edge.minlen : -edge.minlen);
      });
    }
    function isTreeEdge(tree, u, v) {
      return tree.hasEdge(u, v);
    }
    function isDescendant(tree, vLabel, rootLabel) {
      return rootLabel.low <= vLabel.lim && vLabel.lim <= rootLabel.lim;
    }
  }
});

// node_modules/@dagrejs/dagre/lib/rank/index.js
var require_rank = __commonJS({
  "node_modules/@dagrejs/dagre/lib/rank/index.js"(exports, module) {
    var rankUtil = require_util2();
    var longestPath = rankUtil.longestPath;
    var feasibleTree = require_feasible_tree();
    var networkSimplex = require_network_simplex();
    module.exports = rank;
    function rank(g) {
      var ranker = g.graph().ranker;
      if (ranker instanceof Function) {
        return ranker(g);
      }
      switch (g.graph().ranker) {
        case "network-simplex":
          networkSimplexRanker(g);
          break;
        case "tight-tree":
          tightTreeRanker(g);
          break;
        case "longest-path":
          longestPathRanker(g);
          break;
        case "none":
          break;
        default:
          networkSimplexRanker(g);
      }
    }
    var longestPathRanker = longestPath;
    function tightTreeRanker(g) {
      longestPath(g);
      feasibleTree(g);
    }
    function networkSimplexRanker(g) {
      networkSimplex(g);
    }
  }
});

// node_modules/@dagrejs/dagre/lib/parent-dummy-chains.js
var require_parent_dummy_chains = __commonJS({
  "node_modules/@dagrejs/dagre/lib/parent-dummy-chains.js"(exports, module) {
    module.exports = parentDummyChains;
    function parentDummyChains(g) {
      let postorderNums = postorder(g);
      g.graph().dummyChains.forEach((v) => {
        let node = g.node(v);
        let edgeObj = node.edgeObj;
        let pathData = findPath(g, postorderNums, edgeObj.v, edgeObj.w);
        let path = pathData.path;
        let lca = pathData.lca;
        let pathIdx = 0;
        let pathV = path[pathIdx];
        let ascending = true;
        while (v !== edgeObj.w) {
          node = g.node(v);
          if (ascending) {
            while ((pathV = path[pathIdx]) !== lca && g.node(pathV).maxRank < node.rank) {
              pathIdx++;
            }
            if (pathV === lca) {
              ascending = false;
            }
          }
          if (!ascending) {
            while (pathIdx < path.length - 1 && g.node(pathV = path[pathIdx + 1]).minRank <= node.rank) {
              pathIdx++;
            }
            pathV = path[pathIdx];
          }
          g.setParent(v, pathV);
          v = g.successors(v)[0];
        }
      });
    }
    function findPath(g, postorderNums, v, w) {
      let vPath = [];
      let wPath = [];
      let low = Math.min(postorderNums[v].low, postorderNums[w].low);
      let lim = Math.max(postorderNums[v].lim, postorderNums[w].lim);
      let parent;
      let lca;
      parent = v;
      do {
        parent = g.parent(parent);
        vPath.push(parent);
      } while (parent && (postorderNums[parent].low > low || lim > postorderNums[parent].lim));
      lca = parent;
      parent = w;
      while ((parent = g.parent(parent)) !== lca) {
        wPath.push(parent);
      }
      return { path: vPath.concat(wPath.reverse()), lca };
    }
    function postorder(g) {
      let result = {};
      let lim = 0;
      function dfs(v) {
        let low = lim;
        g.children(v).forEach(dfs);
        result[v] = { low, lim: lim++ };
      }
      g.children().forEach(dfs);
      return result;
    }
  }
});

// node_modules/@dagrejs/dagre/lib/nesting-graph.js
var require_nesting_graph = __commonJS({
  "node_modules/@dagrejs/dagre/lib/nesting-graph.js"(exports, module) {
    var util = require_util();
    module.exports = {
      run,
      cleanup
    };
    function run(g) {
      let root = util.addDummyNode(g, "root", {}, "_root");
      let depths = treeDepths(g);
      let depthsArr = Object.values(depths);
      let height = util.applyWithChunking(Math.max, depthsArr) - 1;
      let nodeSep = 2 * height + 1;
      g.graph().nestingRoot = root;
      g.edges().forEach((e) => g.edge(e).minlen *= nodeSep);
      let weight = sumWeights(g) + 1;
      g.children().forEach((child) => dfs(g, root, nodeSep, weight, height, depths, child));
      g.graph().nodeRankFactor = nodeSep;
    }
    function dfs(g, root, nodeSep, weight, height, depths, v) {
      let children = g.children(v);
      if (!children.length) {
        if (v !== root) {
          g.setEdge(root, v, { weight: 0, minlen: nodeSep });
        }
        return;
      }
      let top = util.addBorderNode(g, "_bt");
      let bottom = util.addBorderNode(g, "_bb");
      let label = g.node(v);
      g.setParent(top, v);
      label.borderTop = top;
      g.setParent(bottom, v);
      label.borderBottom = bottom;
      children.forEach((child) => {
        dfs(g, root, nodeSep, weight, height, depths, child);
        let childNode = g.node(child);
        let childTop = childNode.borderTop ? childNode.borderTop : child;
        let childBottom = childNode.borderBottom ? childNode.borderBottom : child;
        let thisWeight = childNode.borderTop ? weight : 2 * weight;
        let minlen = childTop !== childBottom ? 1 : height - depths[v] + 1;
        g.setEdge(top, childTop, {
          weight: thisWeight,
          minlen,
          nestingEdge: true
        });
        g.setEdge(childBottom, bottom, {
          weight: thisWeight,
          minlen,
          nestingEdge: true
        });
      });
      if (!g.parent(v)) {
        g.setEdge(root, top, { weight: 0, minlen: height + depths[v] });
      }
    }
    function treeDepths(g) {
      var depths = {};
      function dfs2(v, depth) {
        var children = g.children(v);
        if (children && children.length) {
          children.forEach((child) => dfs2(child, depth + 1));
        }
        depths[v] = depth;
      }
      g.children().forEach((v) => dfs2(v, 1));
      return depths;
    }
    function sumWeights(g) {
      return g.edges().reduce((acc, e) => acc + g.edge(e).weight, 0);
    }
    function cleanup(g) {
      var graphLabel = g.graph();
      g.removeNode(graphLabel.nestingRoot);
      delete graphLabel.nestingRoot;
      g.edges().forEach((e) => {
        var edge = g.edge(e);
        if (edge.nestingEdge) {
          g.removeEdge(e);
        }
      });
    }
  }
});

// node_modules/@dagrejs/dagre/lib/add-border-segments.js
var require_add_border_segments = __commonJS({
  "node_modules/@dagrejs/dagre/lib/add-border-segments.js"(exports, module) {
    var util = require_util();
    module.exports = addBorderSegments;
    function addBorderSegments(g) {
      function dfs(v) {
        let children = g.children(v);
        let node = g.node(v);
        if (children.length) {
          children.forEach(dfs);
        }
        if (Object.hasOwn(node, "minRank")) {
          node.borderLeft = [];
          node.borderRight = [];
          for (let rank = node.minRank, maxRank = node.maxRank + 1; rank < maxRank; ++rank) {
            addBorderNode(g, "borderLeft", "_bl", v, node, rank);
            addBorderNode(g, "borderRight", "_br", v, node, rank);
          }
        }
      }
      g.children().forEach(dfs);
    }
    function addBorderNode(g, prop, prefix, sg, sgNode, rank) {
      let label = { width: 0, height: 0, rank, borderType: prop };
      let prev = sgNode[prop][rank - 1];
      let curr = util.addDummyNode(g, "border", label, prefix);
      sgNode[prop][rank] = curr;
      g.setParent(curr, sg);
      if (prev) {
        g.setEdge(prev, curr, { weight: 1 });
      }
    }
  }
});

// node_modules/@dagrejs/dagre/lib/coordinate-system.js
var require_coordinate_system = __commonJS({
  "node_modules/@dagrejs/dagre/lib/coordinate-system.js"(exports, module) {
    module.exports = {
      adjust,
      undo
    };
    function adjust(g) {
      let rankDir = g.graph().rankdir.toLowerCase();
      if (rankDir === "lr" || rankDir === "rl") {
        swapWidthHeight(g);
      }
    }
    function undo(g) {
      let rankDir = g.graph().rankdir.toLowerCase();
      if (rankDir === "bt" || rankDir === "rl") {
        reverseY(g);
      }
      if (rankDir === "lr" || rankDir === "rl") {
        swapXY(g);
        swapWidthHeight(g);
      }
    }
    function swapWidthHeight(g) {
      g.nodes().forEach((v) => swapWidthHeightOne(g.node(v)));
      g.edges().forEach((e) => swapWidthHeightOne(g.edge(e)));
    }
    function swapWidthHeightOne(attrs) {
      let w = attrs.width;
      attrs.width = attrs.height;
      attrs.height = w;
    }
    function reverseY(g) {
      g.nodes().forEach((v) => reverseYOne(g.node(v)));
      g.edges().forEach((e) => {
        let edge = g.edge(e);
        edge.points.forEach(reverseYOne);
        if (Object.hasOwn(edge, "y")) {
          reverseYOne(edge);
        }
      });
    }
    function reverseYOne(attrs) {
      attrs.y = -attrs.y;
    }
    function swapXY(g) {
      g.nodes().forEach((v) => swapXYOne(g.node(v)));
      g.edges().forEach((e) => {
        let edge = g.edge(e);
        edge.points.forEach(swapXYOne);
        if (Object.hasOwn(edge, "x")) {
          swapXYOne(edge);
        }
      });
    }
    function swapXYOne(attrs) {
      let x = attrs.x;
      attrs.x = attrs.y;
      attrs.y = x;
    }
  }
});

// node_modules/@dagrejs/dagre/lib/order/init-order.js
var require_init_order = __commonJS({
  "node_modules/@dagrejs/dagre/lib/order/init-order.js"(exports, module) {
    var util = require_util();
    module.exports = initOrder;
    function initOrder(g) {
      let visited = {};
      let simpleNodes = g.nodes().filter((v) => !g.children(v).length);
      let simpleNodesRanks = simpleNodes.map((v) => g.node(v).rank);
      let maxRank = util.applyWithChunking(Math.max, simpleNodesRanks);
      let layers = util.range(maxRank + 1).map(() => []);
      function dfs(v) {
        if (visited[v]) return;
        visited[v] = true;
        let node = g.node(v);
        layers[node.rank].push(v);
        g.successors(v).forEach(dfs);
      }
      let orderedVs = simpleNodes.sort((a, b) => g.node(a).rank - g.node(b).rank);
      orderedVs.forEach(dfs);
      return layers;
    }
  }
});

// node_modules/@dagrejs/dagre/lib/order/cross-count.js
var require_cross_count = __commonJS({
  "node_modules/@dagrejs/dagre/lib/order/cross-count.js"(exports, module) {
    var zipObject = require_util().zipObject;
    module.exports = crossCount;
    function crossCount(g, layering) {
      let cc = 0;
      for (let i = 1; i < layering.length; ++i) {
        cc += twoLayerCrossCount(g, layering[i - 1], layering[i]);
      }
      return cc;
    }
    function twoLayerCrossCount(g, northLayer, southLayer) {
      let southPos = zipObject(southLayer, southLayer.map((v, i) => i));
      let southEntries = northLayer.flatMap((v) => {
        return g.outEdges(v).map((e) => {
          return { pos: southPos[e.w], weight: g.edge(e).weight };
        }).sort((a, b) => a.pos - b.pos);
      });
      let firstIndex = 1;
      while (firstIndex < southLayer.length) firstIndex <<= 1;
      let treeSize = 2 * firstIndex - 1;
      firstIndex -= 1;
      let tree = new Array(treeSize).fill(0);
      let cc = 0;
      southEntries.forEach((entry) => {
        let index = entry.pos + firstIndex;
        tree[index] += entry.weight;
        let weightSum = 0;
        while (index > 0) {
          if (index % 2) {
            weightSum += tree[index + 1];
          }
          index = index - 1 >> 1;
          tree[index] += entry.weight;
        }
        cc += entry.weight * weightSum;
      });
      return cc;
    }
  }
});

// node_modules/@dagrejs/dagre/lib/order/barycenter.js
var require_barycenter = __commonJS({
  "node_modules/@dagrejs/dagre/lib/order/barycenter.js"(exports, module) {
    module.exports = barycenter;
    function barycenter(g, movable = []) {
      return movable.map((v) => {
        let inV = g.inEdges(v);
        if (!inV.length) {
          return { v };
        } else {
          let result = inV.reduce((acc, e) => {
            let edge = g.edge(e), nodeU = g.node(e.v);
            return {
              sum: acc.sum + edge.weight * nodeU.order,
              weight: acc.weight + edge.weight
            };
          }, { sum: 0, weight: 0 });
          return {
            v,
            barycenter: result.sum / result.weight,
            weight: result.weight
          };
        }
      });
    }
  }
});

// node_modules/@dagrejs/dagre/lib/order/resolve-conflicts.js
var require_resolve_conflicts = __commonJS({
  "node_modules/@dagrejs/dagre/lib/order/resolve-conflicts.js"(exports, module) {
    var util = require_util();
    module.exports = resolveConflicts;
    function resolveConflicts(entries, cg) {
      let mappedEntries = {};
      entries.forEach((entry, i) => {
        let tmp = mappedEntries[entry.v] = {
          indegree: 0,
          "in": [],
          out: [],
          vs: [entry.v],
          i
        };
        if (entry.barycenter !== void 0) {
          tmp.barycenter = entry.barycenter;
          tmp.weight = entry.weight;
        }
      });
      cg.edges().forEach((e) => {
        let entryV = mappedEntries[e.v];
        let entryW = mappedEntries[e.w];
        if (entryV !== void 0 && entryW !== void 0) {
          entryW.indegree++;
          entryV.out.push(mappedEntries[e.w]);
        }
      });
      let sourceSet = Object.values(mappedEntries).filter((entry) => !entry.indegree);
      return doResolveConflicts(sourceSet);
    }
    function doResolveConflicts(sourceSet) {
      let entries = [];
      function handleIn(vEntry) {
        return (uEntry) => {
          if (uEntry.merged) {
            return;
          }
          if (uEntry.barycenter === void 0 || vEntry.barycenter === void 0 || uEntry.barycenter >= vEntry.barycenter) {
            mergeEntries(vEntry, uEntry);
          }
        };
      }
      function handleOut(vEntry) {
        return (wEntry) => {
          wEntry["in"].push(vEntry);
          if (--wEntry.indegree === 0) {
            sourceSet.push(wEntry);
          }
        };
      }
      while (sourceSet.length) {
        let entry = sourceSet.pop();
        entries.push(entry);
        entry["in"].reverse().forEach(handleIn(entry));
        entry.out.forEach(handleOut(entry));
      }
      return entries.filter((entry) => !entry.merged).map((entry) => {
        return util.pick(entry, ["vs", "i", "barycenter", "weight"]);
      });
    }
    function mergeEntries(target, source) {
      let sum = 0;
      let weight = 0;
      if (target.weight) {
        sum += target.barycenter * target.weight;
        weight += target.weight;
      }
      if (source.weight) {
        sum += source.barycenter * source.weight;
        weight += source.weight;
      }
      target.vs = source.vs.concat(target.vs);
      target.barycenter = sum / weight;
      target.weight = weight;
      target.i = Math.min(source.i, target.i);
      source.merged = true;
    }
  }
});

// node_modules/@dagrejs/dagre/lib/order/sort.js
var require_sort = __commonJS({
  "node_modules/@dagrejs/dagre/lib/order/sort.js"(exports, module) {
    var util = require_util();
    module.exports = sort;
    function sort(entries, biasRight) {
      let parts = util.partition(entries, (entry) => {
        return Object.hasOwn(entry, "barycenter");
      });
      let sortable = parts.lhs, unsortable = parts.rhs.sort((a, b) => b.i - a.i), vs = [], sum = 0, weight = 0, vsIndex = 0;
      sortable.sort(compareWithBias(!!biasRight));
      vsIndex = consumeUnsortable(vs, unsortable, vsIndex);
      sortable.forEach((entry) => {
        vsIndex += entry.vs.length;
        vs.push(entry.vs);
        sum += entry.barycenter * entry.weight;
        weight += entry.weight;
        vsIndex = consumeUnsortable(vs, unsortable, vsIndex);
      });
      let result = { vs: vs.flat(true) };
      if (weight) {
        result.barycenter = sum / weight;
        result.weight = weight;
      }
      return result;
    }
    function consumeUnsortable(vs, unsortable, index) {
      let last;
      while (unsortable.length && (last = unsortable[unsortable.length - 1]).i <= index) {
        unsortable.pop();
        vs.push(last.vs);
        index++;
      }
      return index;
    }
    function compareWithBias(bias) {
      return (entryV, entryW) => {
        if (entryV.barycenter < entryW.barycenter) {
          return -1;
        } else if (entryV.barycenter > entryW.barycenter) {
          return 1;
        }
        return !bias ? entryV.i - entryW.i : entryW.i - entryV.i;
      };
    }
  }
});

// node_modules/@dagrejs/dagre/lib/order/sort-subgraph.js
var require_sort_subgraph = __commonJS({
  "node_modules/@dagrejs/dagre/lib/order/sort-subgraph.js"(exports, module) {
    var barycenter = require_barycenter();
    var resolveConflicts = require_resolve_conflicts();
    var sort = require_sort();
    module.exports = sortSubgraph;
    function sortSubgraph(g, v, cg, biasRight) {
      let movable = g.children(v);
      let node = g.node(v);
      let bl = node ? node.borderLeft : void 0;
      let br = node ? node.borderRight : void 0;
      let subgraphs = {};
      if (bl) {
        movable = movable.filter((w) => w !== bl && w !== br);
      }
      let barycenters = barycenter(g, movable);
      barycenters.forEach((entry) => {
        if (g.children(entry.v).length) {
          let subgraphResult = sortSubgraph(g, entry.v, cg, biasRight);
          subgraphs[entry.v] = subgraphResult;
          if (Object.hasOwn(subgraphResult, "barycenter")) {
            mergeBarycenters(entry, subgraphResult);
          }
        }
      });
      let entries = resolveConflicts(barycenters, cg);
      expandSubgraphs(entries, subgraphs);
      let result = sort(entries, biasRight);
      if (bl) {
        result.vs = [bl, result.vs, br].flat(true);
        if (g.predecessors(bl).length) {
          let blPred = g.node(g.predecessors(bl)[0]), brPred = g.node(g.predecessors(br)[0]);
          if (!Object.hasOwn(result, "barycenter")) {
            result.barycenter = 0;
            result.weight = 0;
          }
          result.barycenter = (result.barycenter * result.weight + blPred.order + brPred.order) / (result.weight + 2);
          result.weight += 2;
        }
      }
      return result;
    }
    function expandSubgraphs(entries, subgraphs) {
      entries.forEach((entry) => {
        entry.vs = entry.vs.flatMap((v) => {
          if (subgraphs[v]) {
            return subgraphs[v].vs;
          }
          return v;
        });
      });
    }
    function mergeBarycenters(target, other) {
      if (target.barycenter !== void 0) {
        target.barycenter = (target.barycenter * target.weight + other.barycenter * other.weight) / (target.weight + other.weight);
        target.weight += other.weight;
      } else {
        target.barycenter = other.barycenter;
        target.weight = other.weight;
      }
    }
  }
});

// node_modules/@dagrejs/dagre/lib/order/build-layer-graph.js
var require_build_layer_graph = __commonJS({
  "node_modules/@dagrejs/dagre/lib/order/build-layer-graph.js"(exports, module) {
    var Graph = require_graphlib().Graph;
    var util = require_util();
    module.exports = buildLayerGraph;
    function buildLayerGraph(g, rank, relationship, nodesWithRank) {
      if (!nodesWithRank) {
        nodesWithRank = g.nodes();
      }
      let root = createRootNode(g), result = new Graph({ compound: true }).setGraph({ root }).setDefaultNodeLabel((v) => g.node(v));
      nodesWithRank.forEach((v) => {
        let node = g.node(v), parent = g.parent(v);
        if (node.rank === rank || node.minRank <= rank && rank <= node.maxRank) {
          result.setNode(v);
          result.setParent(v, parent || root);
          g[relationship](v).forEach((e) => {
            let u = e.v === v ? e.w : e.v, edge = result.edge(u, v), weight = edge !== void 0 ? edge.weight : 0;
            result.setEdge(u, v, { weight: g.edge(e).weight + weight });
          });
          if (Object.hasOwn(node, "minRank")) {
            result.setNode(v, {
              borderLeft: node.borderLeft[rank],
              borderRight: node.borderRight[rank]
            });
          }
        }
      });
      return result;
    }
    function createRootNode(g) {
      var v;
      while (g.hasNode(v = util.uniqueId("_root"))) ;
      return v;
    }
  }
});

// node_modules/@dagrejs/dagre/lib/order/add-subgraph-constraints.js
var require_add_subgraph_constraints = __commonJS({
  "node_modules/@dagrejs/dagre/lib/order/add-subgraph-constraints.js"(exports, module) {
    module.exports = addSubgraphConstraints;
    function addSubgraphConstraints(g, cg, vs) {
      let prev = {}, rootPrev;
      vs.forEach((v) => {
        let child = g.parent(v), parent, prevChild;
        while (child) {
          parent = g.parent(child);
          if (parent) {
            prevChild = prev[parent];
            prev[parent] = child;
          } else {
            prevChild = rootPrev;
            rootPrev = child;
          }
          if (prevChild && prevChild !== child) {
            cg.setEdge(prevChild, child);
            return;
          }
          child = parent;
        }
      });
    }
  }
});

// node_modules/@dagrejs/dagre/lib/order/index.js
var require_order = __commonJS({
  "node_modules/@dagrejs/dagre/lib/order/index.js"(exports, module) {
    var initOrder = require_init_order();
    var crossCount = require_cross_count();
    var sortSubgraph = require_sort_subgraph();
    var buildLayerGraph = require_build_layer_graph();
    var addSubgraphConstraints = require_add_subgraph_constraints();
    var Graph = require_graphlib().Graph;
    var util = require_util();
    module.exports = order;
    function order(g, opts) {
      if (opts && typeof opts.customOrder === "function") {
        opts.customOrder(g, order);
        return;
      }
      let maxRank = util.maxRank(g), downLayerGraphs = buildLayerGraphs(g, util.range(1, maxRank + 1), "inEdges"), upLayerGraphs = buildLayerGraphs(g, util.range(maxRank - 1, -1, -1), "outEdges");
      let layering = initOrder(g);
      assignOrder(g, layering);
      if (opts && opts.disableOptimalOrderHeuristic) {
        return;
      }
      let bestCC = Number.POSITIVE_INFINITY, best;
      for (let i = 0, lastBest = 0; lastBest < 4; ++i, ++lastBest) {
        sweepLayerGraphs(i % 2 ? downLayerGraphs : upLayerGraphs, i % 4 >= 2);
        layering = util.buildLayerMatrix(g);
        let cc = crossCount(g, layering);
        if (cc < bestCC) {
          lastBest = 0;
          best = Object.assign({}, layering);
          bestCC = cc;
        }
      }
      assignOrder(g, best);
    }
    function buildLayerGraphs(g, ranks, relationship) {
      const nodesByRank = /* @__PURE__ */ new Map();
      const addNodeToRank = (rank, node) => {
        if (!nodesByRank.has(rank)) {
          nodesByRank.set(rank, []);
        }
        nodesByRank.get(rank).push(node);
      };
      for (const v of g.nodes()) {
        const node = g.node(v);
        if (typeof node.rank === "number") {
          addNodeToRank(node.rank, v);
        }
        if (typeof node.minRank === "number" && typeof node.maxRank === "number") {
          for (let r = node.minRank; r <= node.maxRank; r++) {
            if (r !== node.rank) {
              addNodeToRank(r, v);
            }
          }
        }
      }
      return ranks.map(function(rank) {
        return buildLayerGraph(g, rank, relationship, nodesByRank.get(rank) || []);
      });
    }
    function sweepLayerGraphs(layerGraphs, biasRight) {
      let cg = new Graph();
      layerGraphs.forEach(function(lg) {
        let root = lg.graph().root;
        let sorted = sortSubgraph(lg, root, cg, biasRight);
        sorted.vs.forEach((v, i) => lg.node(v).order = i);
        addSubgraphConstraints(lg, cg, sorted.vs);
      });
    }
    function assignOrder(g, layering) {
      Object.values(layering).forEach((layer) => layer.forEach((v, i) => g.node(v).order = i));
    }
  }
});

// node_modules/@dagrejs/dagre/lib/position/bk.js
var require_bk = __commonJS({
  "node_modules/@dagrejs/dagre/lib/position/bk.js"(exports, module) {
    var Graph = require_graphlib().Graph;
    var util = require_util();
    module.exports = {
      positionX,
      findType1Conflicts,
      findType2Conflicts,
      addConflict,
      hasConflict,
      verticalAlignment,
      horizontalCompaction,
      alignCoordinates,
      findSmallestWidthAlignment,
      balance
    };
    function findType1Conflicts(g, layering) {
      let conflicts = {};
      function visitLayer(prevLayer, layer) {
        let k0 = 0, scanPos = 0, prevLayerLength = prevLayer.length, lastNode = layer[layer.length - 1];
        layer.forEach((v, i) => {
          let w = findOtherInnerSegmentNode(g, v), k1 = w ? g.node(w).order : prevLayerLength;
          if (w || v === lastNode) {
            layer.slice(scanPos, i + 1).forEach((scanNode) => {
              g.predecessors(scanNode).forEach((u) => {
                let uLabel = g.node(u), uPos = uLabel.order;
                if ((uPos < k0 || k1 < uPos) && !(uLabel.dummy && g.node(scanNode).dummy)) {
                  addConflict(conflicts, u, scanNode);
                }
              });
            });
            scanPos = i + 1;
            k0 = k1;
          }
        });
        return layer;
      }
      layering.length && layering.reduce(visitLayer);
      return conflicts;
    }
    function findType2Conflicts(g, layering) {
      let conflicts = {};
      function scan(south, southPos, southEnd, prevNorthBorder, nextNorthBorder) {
        let v;
        util.range(southPos, southEnd).forEach((i) => {
          v = south[i];
          if (g.node(v).dummy) {
            g.predecessors(v).forEach((u) => {
              let uNode = g.node(u);
              if (uNode.dummy && (uNode.order < prevNorthBorder || uNode.order > nextNorthBorder)) {
                addConflict(conflicts, u, v);
              }
            });
          }
        });
      }
      function visitLayer(north, south) {
        let prevNorthPos = -1, nextNorthPos, southPos = 0;
        south.forEach((v, southLookahead) => {
          if (g.node(v).dummy === "border") {
            let predecessors = g.predecessors(v);
            if (predecessors.length) {
              nextNorthPos = g.node(predecessors[0]).order;
              scan(south, southPos, southLookahead, prevNorthPos, nextNorthPos);
              southPos = southLookahead;
              prevNorthPos = nextNorthPos;
            }
          }
          scan(south, southPos, south.length, nextNorthPos, north.length);
        });
        return south;
      }
      layering.length && layering.reduce(visitLayer);
      return conflicts;
    }
    function findOtherInnerSegmentNode(g, v) {
      if (g.node(v).dummy) {
        return g.predecessors(v).find((u) => g.node(u).dummy);
      }
    }
    function addConflict(conflicts, v, w) {
      if (v > w) {
        let tmp = v;
        v = w;
        w = tmp;
      }
      let conflictsV = conflicts[v];
      if (!conflictsV) {
        conflicts[v] = conflictsV = {};
      }
      conflictsV[w] = true;
    }
    function hasConflict(conflicts, v, w) {
      if (v > w) {
        let tmp = v;
        v = w;
        w = tmp;
      }
      return !!conflicts[v] && Object.hasOwn(conflicts[v], w);
    }
    function verticalAlignment(g, layering, conflicts, neighborFn) {
      let root = {}, align = {}, pos = {};
      layering.forEach((layer) => {
        layer.forEach((v, order) => {
          root[v] = v;
          align[v] = v;
          pos[v] = order;
        });
      });
      layering.forEach((layer) => {
        let prevIdx = -1;
        layer.forEach((v) => {
          let ws = neighborFn(v);
          if (ws.length) {
            ws = ws.sort((a, b) => pos[a] - pos[b]);
            let mp = (ws.length - 1) / 2;
            for (let i = Math.floor(mp), il = Math.ceil(mp); i <= il; ++i) {
              let w = ws[i];
              if (align[v] === v && prevIdx < pos[w] && !hasConflict(conflicts, v, w)) {
                align[w] = v;
                align[v] = root[v] = root[w];
                prevIdx = pos[w];
              }
            }
          }
        });
      });
      return { root, align };
    }
    function horizontalCompaction(g, layering, root, align, reverseSep) {
      let xs = {}, blockG = buildBlockGraph(g, layering, root, reverseSep), borderType = reverseSep ? "borderLeft" : "borderRight";
      function iterate(setXsFunc, nextNodesFunc) {
        let stack = blockG.nodes();
        let elem = stack.pop();
        let visited = {};
        while (elem) {
          if (visited[elem]) {
            setXsFunc(elem);
          } else {
            visited[elem] = true;
            stack.push(elem);
            stack = stack.concat(nextNodesFunc(elem));
          }
          elem = stack.pop();
        }
      }
      function pass1(elem) {
        xs[elem] = blockG.inEdges(elem).reduce((acc, e) => {
          return Math.max(acc, xs[e.v] + blockG.edge(e));
        }, 0);
      }
      function pass2(elem) {
        let min = blockG.outEdges(elem).reduce((acc, e) => {
          return Math.min(acc, xs[e.w] - blockG.edge(e));
        }, Number.POSITIVE_INFINITY);
        let node = g.node(elem);
        if (min !== Number.POSITIVE_INFINITY && node.borderType !== borderType) {
          xs[elem] = Math.max(xs[elem], min);
        }
      }
      iterate(pass1, blockG.predecessors.bind(blockG));
      iterate(pass2, blockG.successors.bind(blockG));
      Object.keys(align).forEach((v) => xs[v] = xs[root[v]]);
      return xs;
    }
    function buildBlockGraph(g, layering, root, reverseSep) {
      let blockGraph = new Graph(), graphLabel = g.graph(), sepFn = sep(graphLabel.nodesep, graphLabel.edgesep, reverseSep);
      layering.forEach((layer) => {
        let u;
        layer.forEach((v) => {
          let vRoot = root[v];
          blockGraph.setNode(vRoot);
          if (u) {
            var uRoot = root[u], prevMax = blockGraph.edge(uRoot, vRoot);
            blockGraph.setEdge(uRoot, vRoot, Math.max(sepFn(g, v, u), prevMax || 0));
          }
          u = v;
        });
      });
      return blockGraph;
    }
    function findSmallestWidthAlignment(g, xss) {
      return Object.values(xss).reduce((currentMinAndXs, xs) => {
        let max = Number.NEGATIVE_INFINITY;
        let min = Number.POSITIVE_INFINITY;
        Object.entries(xs).forEach(([v, x]) => {
          let halfWidth = width(g, v) / 2;
          max = Math.max(x + halfWidth, max);
          min = Math.min(x - halfWidth, min);
        });
        const newMin = max - min;
        if (newMin < currentMinAndXs[0]) {
          currentMinAndXs = [newMin, xs];
        }
        return currentMinAndXs;
      }, [Number.POSITIVE_INFINITY, null])[1];
    }
    function alignCoordinates(xss, alignTo) {
      let alignToVals = Object.values(alignTo), alignToMin = util.applyWithChunking(Math.min, alignToVals), alignToMax = util.applyWithChunking(Math.max, alignToVals);
      ["u", "d"].forEach((vert) => {
        ["l", "r"].forEach((horiz) => {
          let alignment = vert + horiz, xs = xss[alignment];
          if (xs === alignTo) return;
          let xsVals = Object.values(xs);
          let delta = alignToMin - util.applyWithChunking(Math.min, xsVals);
          if (horiz !== "l") {
            delta = alignToMax - util.applyWithChunking(Math.max, xsVals);
          }
          if (delta) {
            xss[alignment] = util.mapValues(xs, (x) => x + delta);
          }
        });
      });
    }
    function balance(xss, align) {
      return util.mapValues(xss.ul, (num, v) => {
        if (align) {
          return xss[align.toLowerCase()][v];
        } else {
          let xs = Object.values(xss).map((xs2) => xs2[v]).sort((a, b) => a - b);
          return (xs[1] + xs[2]) / 2;
        }
      });
    }
    function positionX(g) {
      let layering = util.buildLayerMatrix(g);
      let conflicts = Object.assign(
        findType1Conflicts(g, layering),
        findType2Conflicts(g, layering)
      );
      let xss = {};
      let adjustedLayering;
      ["u", "d"].forEach((vert) => {
        adjustedLayering = vert === "u" ? layering : Object.values(layering).reverse();
        ["l", "r"].forEach((horiz) => {
          if (horiz === "r") {
            adjustedLayering = adjustedLayering.map((inner) => {
              return Object.values(inner).reverse();
            });
          }
          let neighborFn = (vert === "u" ? g.predecessors : g.successors).bind(g);
          let align = verticalAlignment(g, adjustedLayering, conflicts, neighborFn);
          let xs = horizontalCompaction(
            g,
            adjustedLayering,
            align.root,
            align.align,
            horiz === "r"
          );
          if (horiz === "r") {
            xs = util.mapValues(xs, (x) => -x);
          }
          xss[vert + horiz] = xs;
        });
      });
      let smallestWidth = findSmallestWidthAlignment(g, xss);
      alignCoordinates(xss, smallestWidth);
      return balance(xss, g.graph().align);
    }
    function sep(nodeSep, edgeSep, reverseSep) {
      return (g, v, w) => {
        let vLabel = g.node(v);
        let wLabel = g.node(w);
        let sum = 0;
        let delta;
        sum += vLabel.width / 2;
        if (Object.hasOwn(vLabel, "labelpos")) {
          switch (vLabel.labelpos.toLowerCase()) {
            case "l":
              delta = -vLabel.width / 2;
              break;
            case "r":
              delta = vLabel.width / 2;
              break;
          }
        }
        if (delta) {
          sum += reverseSep ? delta : -delta;
        }
        delta = 0;
        sum += (vLabel.dummy ? edgeSep : nodeSep) / 2;
        sum += (wLabel.dummy ? edgeSep : nodeSep) / 2;
        sum += wLabel.width / 2;
        if (Object.hasOwn(wLabel, "labelpos")) {
          switch (wLabel.labelpos.toLowerCase()) {
            case "l":
              delta = wLabel.width / 2;
              break;
            case "r":
              delta = -wLabel.width / 2;
              break;
          }
        }
        if (delta) {
          sum += reverseSep ? delta : -delta;
        }
        delta = 0;
        return sum;
      };
    }
    function width(g, v) {
      return g.node(v).width;
    }
  }
});

// node_modules/@dagrejs/dagre/lib/position/index.js
var require_position = __commonJS({
  "node_modules/@dagrejs/dagre/lib/position/index.js"(exports, module) {
    var util = require_util();
    var positionX = require_bk().positionX;
    module.exports = position;
    function position(g) {
      g = util.asNonCompoundGraph(g);
      positionY(g);
      Object.entries(positionX(g)).forEach(([v, x]) => g.node(v).x = x);
    }
    function positionY(g) {
      let layering = util.buildLayerMatrix(g);
      let rankSep = g.graph().ranksep;
      let prevY = 0;
      layering.forEach((layer) => {
        const maxHeight = layer.reduce((acc, v) => {
          const height = g.node(v).height;
          if (acc > height) {
            return acc;
          } else {
            return height;
          }
        }, 0);
        layer.forEach((v) => g.node(v).y = prevY + maxHeight / 2);
        prevY += maxHeight + rankSep;
      });
    }
  }
});

// node_modules/@dagrejs/dagre/lib/layout.js
var require_layout = __commonJS({
  "node_modules/@dagrejs/dagre/lib/layout.js"(exports, module) {
    var acyclic = require_acyclic();
    var normalize = require_normalize();
    var rank = require_rank();
    var normalizeRanks = require_util().normalizeRanks;
    var parentDummyChains = require_parent_dummy_chains();
    var removeEmptyRanks = require_util().removeEmptyRanks;
    var nestingGraph = require_nesting_graph();
    var addBorderSegments = require_add_border_segments();
    var coordinateSystem = require_coordinate_system();
    var order = require_order();
    var position = require_position();
    var util = require_util();
    var Graph = require_graphlib().Graph;
    module.exports = layout2;
    function layout2(g, opts) {
      let time = opts && opts.debugTiming ? util.time : util.notime;
      time("layout", () => {
        let layoutGraph = time("  buildLayoutGraph", () => buildLayoutGraph(g));
        time("  runLayout", () => runLayout(layoutGraph, time, opts));
        time("  updateInputGraph", () => updateInputGraph(g, layoutGraph));
      });
    }
    function runLayout(g, time, opts) {
      time("    makeSpaceForEdgeLabels", () => makeSpaceForEdgeLabels(g));
      time("    removeSelfEdges", () => removeSelfEdges(g));
      time("    acyclic", () => acyclic.run(g));
      time("    nestingGraph.run", () => nestingGraph.run(g));
      time("    rank", () => rank(util.asNonCompoundGraph(g)));
      time("    injectEdgeLabelProxies", () => injectEdgeLabelProxies(g));
      time("    removeEmptyRanks", () => removeEmptyRanks(g));
      time("    nestingGraph.cleanup", () => nestingGraph.cleanup(g));
      time("    normalizeRanks", () => normalizeRanks(g));
      time("    assignRankMinMax", () => assignRankMinMax(g));
      time("    removeEdgeLabelProxies", () => removeEdgeLabelProxies(g));
      time("    normalize.run", () => normalize.run(g));
      time("    parentDummyChains", () => parentDummyChains(g));
      time("    addBorderSegments", () => addBorderSegments(g));
      time("    order", () => order(g, opts));
      time("    insertSelfEdges", () => insertSelfEdges(g));
      time("    adjustCoordinateSystem", () => coordinateSystem.adjust(g));
      time("    position", () => position(g));
      time("    positionSelfEdges", () => positionSelfEdges(g));
      time("    removeBorderNodes", () => removeBorderNodes(g));
      time("    normalize.undo", () => normalize.undo(g));
      time("    fixupEdgeLabelCoords", () => fixupEdgeLabelCoords(g));
      time("    undoCoordinateSystem", () => coordinateSystem.undo(g));
      time("    translateGraph", () => translateGraph(g));
      time("    assignNodeIntersects", () => assignNodeIntersects(g));
      time("    reversePoints", () => reversePointsForReversedEdges(g));
      time("    acyclic.undo", () => acyclic.undo(g));
    }
    function updateInputGraph(inputGraph, layoutGraph) {
      inputGraph.nodes().forEach((v) => {
        let inputLabel = inputGraph.node(v);
        let layoutLabel = layoutGraph.node(v);
        if (inputLabel) {
          inputLabel.x = layoutLabel.x;
          inputLabel.y = layoutLabel.y;
          inputLabel.rank = layoutLabel.rank;
          if (layoutGraph.children(v).length) {
            inputLabel.width = layoutLabel.width;
            inputLabel.height = layoutLabel.height;
          }
        }
      });
      inputGraph.edges().forEach((e) => {
        let inputLabel = inputGraph.edge(e);
        let layoutLabel = layoutGraph.edge(e);
        inputLabel.points = layoutLabel.points;
        if (Object.hasOwn(layoutLabel, "x")) {
          inputLabel.x = layoutLabel.x;
          inputLabel.y = layoutLabel.y;
        }
      });
      inputGraph.graph().width = layoutGraph.graph().width;
      inputGraph.graph().height = layoutGraph.graph().height;
    }
    var graphNumAttrs = ["nodesep", "edgesep", "ranksep", "marginx", "marginy"];
    var graphDefaults = { ranksep: 50, edgesep: 20, nodesep: 50, rankdir: "tb" };
    var graphAttrs = ["acyclicer", "ranker", "rankdir", "align"];
    var nodeNumAttrs = ["width", "height", "rank"];
    var nodeDefaults = { width: 0, height: 0 };
    var edgeNumAttrs = ["minlen", "weight", "width", "height", "labeloffset"];
    var edgeDefaults = {
      minlen: 1,
      weight: 1,
      width: 0,
      height: 0,
      labeloffset: 10,
      labelpos: "r"
    };
    var edgeAttrs = ["labelpos"];
    function buildLayoutGraph(inputGraph) {
      let g = new Graph({ multigraph: true, compound: true });
      let graph = canonicalize(inputGraph.graph());
      g.setGraph(Object.assign(
        {},
        graphDefaults,
        selectNumberAttrs(graph, graphNumAttrs),
        util.pick(graph, graphAttrs)
      ));
      inputGraph.nodes().forEach((v) => {
        let node = canonicalize(inputGraph.node(v));
        const newNode = selectNumberAttrs(node, nodeNumAttrs);
        Object.keys(nodeDefaults).forEach((k) => {
          if (newNode[k] === void 0) {
            newNode[k] = nodeDefaults[k];
          }
        });
        g.setNode(v, newNode);
        g.setParent(v, inputGraph.parent(v));
      });
      inputGraph.edges().forEach((e) => {
        let edge = canonicalize(inputGraph.edge(e));
        g.setEdge(e, Object.assign(
          {},
          edgeDefaults,
          selectNumberAttrs(edge, edgeNumAttrs),
          util.pick(edge, edgeAttrs)
        ));
      });
      return g;
    }
    function makeSpaceForEdgeLabels(g) {
      let graph = g.graph();
      graph.ranksep /= 2;
      g.edges().forEach((e) => {
        let edge = g.edge(e);
        edge.minlen *= 2;
        if (edge.labelpos.toLowerCase() !== "c") {
          if (graph.rankdir === "TB" || graph.rankdir === "BT") {
            edge.width += edge.labeloffset;
          } else {
            edge.height += edge.labeloffset;
          }
        }
      });
    }
    function injectEdgeLabelProxies(g) {
      g.edges().forEach((e) => {
        let edge = g.edge(e);
        if (edge.width && edge.height) {
          let v = g.node(e.v);
          let w = g.node(e.w);
          let label = { rank: (w.rank - v.rank) / 2 + v.rank, e };
          util.addDummyNode(g, "edge-proxy", label, "_ep");
        }
      });
    }
    function assignRankMinMax(g) {
      let maxRank = 0;
      g.nodes().forEach((v) => {
        let node = g.node(v);
        if (node.borderTop) {
          node.minRank = g.node(node.borderTop).rank;
          node.maxRank = g.node(node.borderBottom).rank;
          maxRank = Math.max(maxRank, node.maxRank);
        }
      });
      g.graph().maxRank = maxRank;
    }
    function removeEdgeLabelProxies(g) {
      g.nodes().forEach((v) => {
        let node = g.node(v);
        if (node.dummy === "edge-proxy") {
          g.edge(node.e).labelRank = node.rank;
          g.removeNode(v);
        }
      });
    }
    function translateGraph(g) {
      let minX = Number.POSITIVE_INFINITY;
      let maxX = 0;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = 0;
      let graphLabel = g.graph();
      let marginX = graphLabel.marginx || 0;
      let marginY = graphLabel.marginy || 0;
      function getExtremes(attrs) {
        let x = attrs.x;
        let y = attrs.y;
        let w = attrs.width;
        let h = attrs.height;
        minX = Math.min(minX, x - w / 2);
        maxX = Math.max(maxX, x + w / 2);
        minY = Math.min(minY, y - h / 2);
        maxY = Math.max(maxY, y + h / 2);
      }
      g.nodes().forEach((v) => getExtremes(g.node(v)));
      g.edges().forEach((e) => {
        let edge = g.edge(e);
        if (Object.hasOwn(edge, "x")) {
          getExtremes(edge);
        }
      });
      minX -= marginX;
      minY -= marginY;
      g.nodes().forEach((v) => {
        let node = g.node(v);
        node.x -= minX;
        node.y -= minY;
      });
      g.edges().forEach((e) => {
        let edge = g.edge(e);
        edge.points.forEach((p) => {
          p.x -= minX;
          p.y -= minY;
        });
        if (Object.hasOwn(edge, "x")) {
          edge.x -= minX;
        }
        if (Object.hasOwn(edge, "y")) {
          edge.y -= minY;
        }
      });
      graphLabel.width = maxX - minX + marginX;
      graphLabel.height = maxY - minY + marginY;
    }
    function assignNodeIntersects(g) {
      g.edges().forEach((e) => {
        let edge = g.edge(e);
        let nodeV = g.node(e.v);
        let nodeW = g.node(e.w);
        let p1, p2;
        if (!edge.points) {
          edge.points = [];
          p1 = nodeW;
          p2 = nodeV;
        } else {
          p1 = edge.points[0];
          p2 = edge.points[edge.points.length - 1];
        }
        edge.points.unshift(util.intersectRect(nodeV, p1));
        edge.points.push(util.intersectRect(nodeW, p2));
      });
    }
    function fixupEdgeLabelCoords(g) {
      g.edges().forEach((e) => {
        let edge = g.edge(e);
        if (Object.hasOwn(edge, "x")) {
          if (edge.labelpos === "l" || edge.labelpos === "r") {
            edge.width -= edge.labeloffset;
          }
          switch (edge.labelpos) {
            case "l":
              edge.x -= edge.width / 2 + edge.labeloffset;
              break;
            case "r":
              edge.x += edge.width / 2 + edge.labeloffset;
              break;
          }
        }
      });
    }
    function reversePointsForReversedEdges(g) {
      g.edges().forEach((e) => {
        let edge = g.edge(e);
        if (edge.reversed) {
          edge.points.reverse();
        }
      });
    }
    function removeBorderNodes(g) {
      g.nodes().forEach((v) => {
        if (g.children(v).length) {
          let node = g.node(v);
          let t = g.node(node.borderTop);
          let b = g.node(node.borderBottom);
          let l = g.node(node.borderLeft[node.borderLeft.length - 1]);
          let r = g.node(node.borderRight[node.borderRight.length - 1]);
          node.width = Math.abs(r.x - l.x);
          node.height = Math.abs(b.y - t.y);
          node.x = l.x + node.width / 2;
          node.y = t.y + node.height / 2;
        }
      });
      g.nodes().forEach((v) => {
        if (g.node(v).dummy === "border") {
          g.removeNode(v);
        }
      });
    }
    function removeSelfEdges(g) {
      g.edges().forEach((e) => {
        if (e.v === e.w) {
          var node = g.node(e.v);
          if (!node.selfEdges) {
            node.selfEdges = [];
          }
          node.selfEdges.push({ e, label: g.edge(e) });
          g.removeEdge(e);
        }
      });
    }
    function insertSelfEdges(g) {
      var layers = util.buildLayerMatrix(g);
      layers.forEach((layer) => {
        var orderShift = 0;
        layer.forEach((v, i) => {
          var node = g.node(v);
          node.order = i + orderShift;
          (node.selfEdges || []).forEach((selfEdge) => {
            util.addDummyNode(g, "selfedge", {
              width: selfEdge.label.width,
              height: selfEdge.label.height,
              rank: node.rank,
              order: i + ++orderShift,
              e: selfEdge.e,
              label: selfEdge.label
            }, "_se");
          });
          delete node.selfEdges;
        });
      });
    }
    function positionSelfEdges(g) {
      g.nodes().forEach((v) => {
        var node = g.node(v);
        if (node.dummy === "selfedge") {
          var selfNode = g.node(node.e.v);
          var x = selfNode.x + selfNode.width / 2;
          var y = selfNode.y;
          var dx = node.x - x;
          var dy = selfNode.height / 2;
          g.setEdge(node.e, node.label);
          g.removeNode(v);
          node.label.points = [
            { x: x + 2 * dx / 3, y: y - dy },
            { x: x + 5 * dx / 6, y: y - dy },
            { x: x + dx, y },
            { x: x + 5 * dx / 6, y: y + dy },
            { x: x + 2 * dx / 3, y: y + dy }
          ];
          node.label.x = node.x;
          node.label.y = node.y;
        }
      });
    }
    function selectNumberAttrs(obj, attrs) {
      return util.mapValues(util.pick(obj, attrs), Number);
    }
    function canonicalize(attrs) {
      var newAttrs = {};
      if (attrs) {
        Object.entries(attrs).forEach(([k, v]) => {
          if (typeof k === "string") {
            k = k.toLowerCase();
          }
          newAttrs[k] = v;
        });
      }
      return newAttrs;
    }
  }
});

// node_modules/@dagrejs/dagre/lib/debug.js
var require_debug = __commonJS({
  "node_modules/@dagrejs/dagre/lib/debug.js"(exports, module) {
    var util = require_util();
    var Graph = require_graphlib().Graph;
    module.exports = {
      debugOrdering
    };
    function debugOrdering(g) {
      let layerMatrix = util.buildLayerMatrix(g);
      let h = new Graph({ compound: true, multigraph: true }).setGraph({});
      g.nodes().forEach((v) => {
        h.setNode(v, { label: v });
        h.setParent(v, "layer" + g.node(v).rank);
      });
      g.edges().forEach((e) => h.setEdge(e.v, e.w, {}, e.name));
      layerMatrix.forEach((layer, i) => {
        let layerV = "layer" + i;
        h.setNode(layerV, { rank: "same" });
        layer.reduce((u, v) => {
          h.setEdge(u, v, { style: "invis" });
          return v;
        });
      });
      return h;
    }
  }
});

// node_modules/@dagrejs/dagre/lib/version.js
var require_version2 = __commonJS({
  "node_modules/@dagrejs/dagre/lib/version.js"(exports, module) {
    module.exports = "1.1.8";
  }
});

// node_modules/@dagrejs/dagre/index.js
var require_dagre = __commonJS({
  "node_modules/@dagrejs/dagre/index.js"(exports, module) {
    module.exports = {
      graphlib: require_graphlib(),
      layout: require_layout(),
      debug: require_debug(),
      util: {
        time: require_util().time,
        notime: require_util().notime
      },
      version: require_version2()
    };
  }
});

// src/mermaid/jsdom-env.ts
var jsdom_env_exports = {};
__export(jsdom_env_exports, {
  ensureNodeDom: () => ensureNodeDom
});
function installSvgStubs(proto) {
  proto.getBBox = function getBBox() {
    const text = this.textContent || "";
    return { x: 0, y: 0, width: Math.max(10, text.length * 8), height: 16 };
  };
  proto.getComputedTextLength = function getComputedTextLength() {
    return Math.max(10, (this.textContent || "").length * 8);
  };
  proto.getPointAtLength = function getPointAtLength() {
    return { x: 0, y: 0 };
  };
  proto.getTotalLength = function getTotalLength() {
    return 100;
  };
  proto.getScreenCTM = function getScreenCTM() {
    return { a: 1, b: 0, c: 1, d: 1, e: 0, f: 0, inverse: () => ({}) };
  };
}
function defineGlobal(key, value) {
  if (value === void 0) return;
  try {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true
    });
  } catch {
  }
}
async function ensureNodeDom() {
  if (installed) return;
  const { JSDOM, VirtualConsole } = await import('jsdom');
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {
  });
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    pretendToBeVisual: true,
    virtualConsole
  });
  const { window } = dom;
  installSvgStubs(window.SVGElement.prototype);
  window.CSSStyleSheet = CSSStyleSheetShim;
  const values = {
    window,
    document: window.document,
    navigator: window.navigator,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    CSSStyleSheet: CSSStyleSheetShim,
    screen: SCREEN_STUB
  };
  for (const key of GLOBAL_KEYS) {
    const v = key in values ? values[key] : window[key];
    defineGlobal(key, v);
  }
  installed = true;
}
var CSSStyleSheetShim, SCREEN_STUB, GLOBAL_KEYS, installed;
var init_jsdom_env = __esm({
  "src/mermaid/jsdom-env.ts"() {
    CSSStyleSheetShim = class {
      cssRules = [];
      insertRule(rule, index = this.cssRules.length) {
        this.cssRules.splice(index, 0, { cssText: String(rule) });
        return index;
      }
      replaceSync(text) {
        this.cssRules = [{ cssText: String(text) }];
      }
    };
    SCREEN_STUB = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1080 };
    GLOBAL_KEYS = [
      "window",
      "document",
      "navigator",
      "SVGElement",
      "Element",
      "Node",
      "HTMLElement",
      "DOMParser",
      "XMLSerializer",
      "Event",
      "CustomEvent",
      "MutationObserver",
      "NodeList",
      "DocumentFragment",
      "getComputedStyle",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "CSSStyleSheet",
      "screen"
    ];
    installed = false;
  }
});

// src/render/style.ts
var SAFE_COLOR = /^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]*\)|[a-zA-Z]+)$/;
var SAFE_FONT_FAMILY = /^[A-Za-z0-9 ,'"-]+$/;
function isSafeColor(value) {
  return SAFE_COLOR.test(value.trim());
}
function sanitizeFontFamily(value) {
  const v = value.trim();
  if (v === "" || v.length > 200) return null;
  return SAFE_FONT_FAMILY.test(v) ? v : null;
}
function sanitizeFontSize(value) {
  const n2 = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n2) || n2 <= 0 || n2 > 512) return null;
  return `${n2}px`;
}
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeXmlAttr(s) {
  return escapeXml(s).replace(/"/g, "&quot;");
}

// src/parser/index.ts
var ParseError = class extends Error {
  diagnostics;
  constructor(diagnostics) {
    const first = diagnostics[0];
    super(
      first ? `${first.message} (line ${first.line}, col ${first.col})` : "parse error"
    );
    this.name = "ParseError";
    this.diagnostics = diagnostics;
  }
};
var DIRECTIONS = /* @__PURE__ */ new Set(["TB", "TD", "BT", "LR", "RL"]);
var SHAPE_DELIMS = [
  { open: "([", close: "])", shape: "stadium" },
  { open: "[[", close: "]]", shape: "subroutine" },
  { open: "[(", close: ")]", shape: "cylinder" },
  { open: "[/", close: "/]", shape: "parallelogram" },
  { open: "[\\", close: "\\]", shape: "parallelogram-alt" },
  { open: "((", close: "))", shape: "circle" },
  { open: "{{", close: "}}", shape: "hexagon" },
  { open: "[", close: "]", shape: "rect" },
  { open: "(", close: ")", shape: "rounded" },
  { open: "{", close: "}", shape: "diamond" }
];
function parse(dsl, opts = {}) {
  const strict = opts.strict === true;
  const diagnostics = [];
  const model = {
    direction: "TB",
    nodes: [],
    edges: [],
    subgraphs: [],
    classDefs: /* @__PURE__ */ new Map(),
    warnings: []
  };
  const nodeMap = /* @__PURE__ */ new Map();
  const subgraphStack = [];
  const subgraphOpenPos = /* @__PURE__ */ new Map();
  let subgraphCounter = 0;
  const diag = (code, message, line, col) => {
    diagnostics.push({
      severity: strict ? "error" : "warning",
      code,
      message,
      line,
      col
    });
  };
  const ensureNode = (id) => {
    let node = nodeMap.get(id);
    if (!node) {
      node = { id, label: id, shape: "rect", classes: [] };
      nodeMap.set(id, node);
      model.nodes.push(node);
      const parent = subgraphStack[subgraphStack.length - 1];
      if (parent && !parent.children.includes(id)) parent.children.push(id);
    }
    return node;
  };
  const statements = collectStatements(dsl, diag);
  let startIndex = 0;
  const header = statements[0];
  if (header) {
    const m = /^(?:flowchart|graph)\b[ \t]*([A-Za-z]{2})?/.exec(header.text);
    if (m) {
      startIndex = 1;
      const dir = m[1]?.toUpperCase();
      if (dir) {
        if (DIRECTIONS.has(dir)) {
          model.direction = normalizeDirection(dir);
        } else {
          diag(
            "unknown-direction",
            `unknown direction "${m[1]}"; using TB`,
            header.line,
            header.col
          );
        }
      }
      const rest = header.text.slice(m[0].length).trim();
      if (rest) {
        statements[0] = { ...header, text: rest };
        startIndex = 0;
      }
    } else {
      diag(
        "missing-header",
        "no `flowchart`/`graph` header; assuming flowchart TB",
        header.line,
        header.col
      );
    }
  }
  for (let s = startIndex; s < statements.length; s++) {
    const stmt = statements[s];
    if (!stmt) continue;
    parseStatement(stmt);
  }
  if (subgraphStack.length > 0) {
    for (const open of subgraphStack) {
      const pos = subgraphOpenPos.get(open);
      diag(
        "unterminated-subgraph",
        `subgraph "${open.title || open.id}" is missing an \`end\``,
        pos ? pos.line : 1,
        pos ? pos.col : 1
      );
    }
  }
  model.warnings = diagnostics;
  if (strict && diagnostics.length > 0) throw new ParseError(diagnostics);
  return model;
  function parseStatement(stmt) {
    const text = stmt.text.trim();
    if (text === "") return;
    const leadCol = stmt.col + (stmt.text.length - stmt.text.trimStart().length);
    if (/^subgraph\b/.test(text)) return openSubgraph(text.slice("subgraph".length), stmt, leadCol);
    if (text === "end") return closeSubgraph(stmt, leadCol);
    if (/^classDef\b/.test(text)) return parseClassDef(text.slice("classDef".length).trim(), stmt, leadCol);
    if (/^class\b/.test(text)) return parseClass(text.slice("class".length).trim(), stmt, leadCol);
    if (/^style\b/.test(text)) return parseStyle(text.slice("style".length).trim(), stmt, leadCol);
    if (/^direction\b/.test(text)) return parseDirection(text.slice("direction".length).trim(), stmt, leadCol);
    if (/^(linkStyle|click|href|call)\b/.test(text)) {
      diag(
        "ignored-statement",
        `\`${text.split(/\s/)[0]}\` is not supported in v1 and was ignored`,
        stmt.line,
        leadCol
      );
      return;
    }
    parseChain(stmt);
  }
  function openSubgraph(rest, stmt, col) {
    const body = rest.trim();
    let id;
    let title;
    let m;
    if (body === "") {
      id = `subGraph${subgraphCounter++}`;
      title = "";
    } else if (m = /^([A-Za-z0-9_]+)[ \t]*\[(.*)\]$/.exec(body)) {
      id = m[1];
      title = unquote(m[2].trim());
    } else if (m = /^"(.*)"$/.exec(body)) {
      id = `subGraph${subgraphCounter++}`;
      title = m[1];
    } else if (/^[A-Za-z0-9_]+$/.test(body)) {
      id = body;
      title = body;
    } else {
      id = `subGraph${subgraphCounter++}`;
      title = unquote(body);
    }
    const sub = { id, title, children: [] };
    const parent = subgraphStack[subgraphStack.length - 1];
    if (parent && !parent.children.includes(id)) parent.children.push(id);
    model.subgraphs.push(sub);
    subgraphStack.push(sub);
    subgraphOpenPos.set(sub, { line: stmt.line, col });
  }
  function closeSubgraph(stmt, col) {
    if (subgraphStack.length === 0) {
      diag("unmatched-end", "`end` without a matching `subgraph`", stmt.line, col);
      return;
    }
    subgraphStack.pop();
  }
  function parseDirection(rest, stmt, col) {
    const dir = rest.toUpperCase();
    if (!DIRECTIONS.has(dir)) {
      diag("unknown-direction", `unknown direction "${rest}"`, stmt.line, col);
      return;
    }
    const norm = normalizeDirection(dir);
    const current = subgraphStack[subgraphStack.length - 1];
    if (current) current.direction = norm;
    else model.direction = norm;
  }
  function parseClassDef(rest, stmt, col) {
    const sp = rest.indexOf(" ");
    if (sp === -1) {
      diag("bad-classdef", "classDef needs a name and style properties", stmt.line, col);
      return;
    }
    const names = rest.slice(0, sp).split(",").map((n2) => n2.trim()).filter(Boolean);
    const style = parseStyleProps(
      rest.slice(sp + 1),
      (key) => diag("unsafe-style-value", `dropped unsafe value for \`${key}\``, stmt.line, col)
    );
    for (const name of names) {
      const existing = model.classDefs.get(name);
      model.classDefs.set(name, existing ? { ...existing, ...style } : style);
    }
  }
  function parseClass(rest, stmt, col) {
    const m = /^(.+?)[ \t]+([A-Za-z0-9_]+)$/.exec(rest);
    if (!m) {
      diag("bad-class", "class needs node ids and a class name", stmt.line, col);
      return;
    }
    const ids = m[1].split(",").map((n2) => n2.trim()).filter(Boolean);
    const cls = m[2];
    for (const id of ids) {
      const node = ensureNode(id);
      if (!node.classes.includes(cls)) node.classes.push(cls);
    }
  }
  function parseStyle(rest, stmt, col) {
    const m = /^(\S+)[ \t]+(.+)$/.exec(rest);
    if (!m) {
      diag("bad-style", "style needs a node id and style properties", stmt.line, col);
      return;
    }
    const node = ensureNode(m[1]);
    node.style = {
      ...node.style ?? {},
      ...parseStyleProps(
        m[2],
        (key) => diag("unsafe-style-value", `dropped unsafe value for \`${key}\``, stmt.line, col)
      )
    };
  }
  function parseChain(stmt) {
    const text = stmt.text;
    let i = 0;
    const skipWs = () => {
      while (i < text.length && (text[i] === " " || text[i] === "	")) i++;
    };
    const colAt = (idx) => stmt.col + idx;
    skipWs();
    let group = parseNodeGroup();
    if (group.length === 0) {
      diag("expected-node", "expected a node id", stmt.line, colAt(i));
      return;
    }
    for (; ; ) {
      skipWs();
      if (i >= text.length) break;
      const link = matchLink(text.slice(i));
      if (!link) {
        diag(
          "unexpected-token",
          `unexpected "${text.slice(i).trim().slice(0, 16)}"`,
          stmt.line,
          colAt(i)
        );
        break;
      }
      i += link.consumed;
      skipWs();
      const next = parseNodeGroup();
      if (next.length === 0) {
        diag("expected-node", "expected an edge target after the link", stmt.line, colAt(i));
        break;
      }
      for (const from of group) {
        for (const to of next) {
          const edge = {
            from,
            to,
            kind: link.kind,
            arrows: link.arrows,
            length: link.length
          };
          if (link.label !== void 0 && link.label !== "") edge.label = link.label;
          model.edges.push(edge);
        }
      }
      group = next;
    }
    function parseNodeGroup() {
      const ids = [];
      for (; ; ) {
        skipWs();
        const id = parseNodeRef();
        if (id === null) break;
        ids.push(id);
        skipWs();
        if (text[i] === "&") {
          i++;
          continue;
        }
        break;
      }
      return ids;
    }
    function parseNodeRef() {
      const idMatch = /^[A-Za-z0-9_]+/.exec(text.slice(i));
      if (!idMatch) return null;
      const id = idMatch[0];
      i += id.length;
      const node = ensureNode(id);
      const shaped = readShape();
      if (shaped) {
        node.shape = shaped.shape;
        node.label = shaped.label;
      }
      while (text.startsWith(":::", i)) {
        i += 3;
        const cm = /^[A-Za-z0-9_]+/.exec(text.slice(i));
        if (cm) {
          i += cm[0].length;
          if (!node.classes.includes(cm[0])) node.classes.push(cm[0]);
        } else {
          diag("bad-class-ref", "expected a class name after `:::`", stmt.line, colAt(i));
          break;
        }
      }
      return id;
    }
    function readShape() {
      const rest = text.slice(i);
      for (const { open, close, shape } of SHAPE_DELIMS) {
        if (!rest.startsWith(open)) continue;
        const bodyStart = i + open.length;
        let label;
        let end;
        if (text[bodyStart] === '"') {
          const q = text.indexOf('"', bodyStart + 1);
          if (q === -1) {
            diag("unterminated-quote", "unterminated quoted label", stmt.line, colAt(bodyStart));
            label = text.slice(bodyStart + 1);
            end = text.length;
          } else {
            label = text.slice(bodyStart + 1, q);
            const closeAt = text.indexOf(close, q + 1);
            end = closeAt === -1 ? text.length : closeAt + close.length;
          }
        } else {
          const closeAt = text.indexOf(close, bodyStart);
          if (closeAt === -1) {
            diag("unterminated-shape", `unterminated \`${open}\` shape`, stmt.line, colAt(i));
            label = text.slice(bodyStart);
            end = text.length;
          } else {
            label = text.slice(bodyStart, closeAt);
            end = closeAt + close.length;
          }
        }
        i = end;
        return { shape, label: normalizeLabel(label) };
      }
      return null;
    }
  }
}
function collectStatements(dsl, diag) {
  const out = [];
  const lines = dsl.split(/\r\n|\r|\n/);
  for (let l = 0; l < lines.length; l++) {
    const raw = lines[l];
    const lineNo = l + 1;
    if (/^\s*%%\{.*\}%%\s*$/.test(raw)) {
      const at = raw.indexOf("%%") + 1;
      diag("ignored-directive", "`%%{\u2026}%%` init directive ignored", lineNo, at);
      continue;
    }
    const cleaned = stripComment(raw);
    let start = 0;
    let inStr = false;
    for (let c = 0; c <= cleaned.length; c++) {
      const ch = cleaned[c];
      if (ch === '"') inStr = !inStr;
      if (ch === ";" && !inStr || c === cleaned.length) {
        const seg = cleaned.slice(start, c);
        if (seg.trim() !== "") out.push({ text: seg, line: lineNo, col: start + 1 });
        start = c + 1;
      }
    }
  }
  return out;
}
function stripComment(line) {
  let inStr = false;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (ch === '"') inStr = !inStr;
    if (!inStr && ch === "%" && line[i + 1] === "%") return line.slice(0, i);
  }
  return line;
}
function normalizeLabel(label) {
  return label.replace(/<br\s*\/?>/gi, "\n").trim();
}
function unquote(s) {
  const m = /^"(.*)"$/.exec(s);
  return normalizeLabel(m ? m[1] : s);
}
function normalizeDirection(dir) {
  return dir === "TD" ? "TB" : dir;
}
var SAFE_WIDTH = /^[0-9]*\.?[0-9]+(?:px|pt|em|rem|%)?$/;
var SAFE_DASH = /^[0-9][0-9.,\s]*$/;
function isSafeStyleValue(key, value) {
  switch (key) {
    case "stroke-width":
      return SAFE_WIDTH.test(value);
    case "stroke-dasharray":
      return SAFE_DASH.test(value);
    case "fill":
    case "stroke":
    case "color":
      return isSafeColor(value);
    default:
      return true;
  }
}
function splitTopLevelCommas(input) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth > 0) depth--;
    } else if (ch === "," && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(input.slice(start));
  return parts;
}
function parseStyleProps(input, onDrop) {
  const style = {};
  for (const part of splitTopLevelCommas(input)) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "" || value === "") continue;
    if (!isSafeStyleValue(key, value)) {
      onDrop?.(key, value);
      continue;
    }
    switch (key) {
      case "stroke-width":
        style.strokeWidth = value;
        break;
      case "stroke-dasharray":
        style.strokeDasharray = value;
        break;
      default:
        style[key] = value;
    }
  }
  return style;
}
function matchLink(rest) {
  const mid = /^([<xo])?={2,}[ \t]+(.+?)[ \t]+={2,}([>xo])?/.exec(rest) ?? /^([<xo])?-\.+[ \t]+(.+?)[ \t]+\.+-([>xo])?/.exec(rest) ?? /^([<xo])?-{2,}[ \t]+(.+?)[ \t]+-{2,}([>xo])?/.exec(rest);
  let m = mid;
  let label;
  let lineStyle;
  if (m) {
    label = normalizeLabel(m[2]);
    lineStyle = m[0].includes("=") ? "thick" : m[0].includes(".") ? "dotted" : "solid";
  } else {
    m = /^([<xo])?-\.+-([>xo])?/.exec(rest) ?? /^([<xo])?={2,}([>xo])?/.exec(rest) ?? /^([<xo])?-{2,}([>xo])?/.exec(rest);
    if (!m) return null;
    lineStyle = m[0].includes("=") ? "thick" : m[0].includes(".") ? "dotted" : "solid";
  }
  let consumed = m[0].length;
  const startMarker = m[1];
  const endMarker = m[m.length - 1];
  const arrows = {
    start: startMarker === "<" || startMarker === "x" || startMarker === "o",
    end: endMarker === ">" || endMarker === "x" || endMarker === "o"
  };
  const pipe = /^[ \t]*\|([^|]*)\|/.exec(rest.slice(consumed));
  if (pipe) {
    label = normalizeLabel(pipe[1]);
    consumed += pipe[0].length;
  }
  const lineChars = m[0].replace(/[<>xo]/g, "");
  const length = lineChars.replace(/[^-=]/g, "").length || 2;
  let kind;
  if (lineStyle === "dotted") kind = "dotted";
  else if (lineStyle === "thick") kind = "thick";
  else kind = arrows.start || arrows.end ? "solid" : "open";
  const out = { consumed, kind, arrows, length };
  if (label !== void 0) out.label = label;
  return out;
}

// src/layout/index.ts
var dagreNs = __toESM(require_dagre());

// src/theme/index.ts
var MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
var SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
var MONO_ARCH = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
var domainRolesDark = {
  frontend: { fill: "rgba(8,51,68,0.55)", stroke: "#22d3ee", text: "#e6feff" },
  backend: { fill: "rgba(6,78,59,0.55)", stroke: "#34d399", text: "#e7fff4" },
  database: { fill: "rgba(76,29,149,0.5)", stroke: "#a78bfa", text: "#f1ebff" },
  cloud: { fill: "rgba(120,53,15,0.55)", stroke: "#fbbf24", text: "#fff6e0" },
  security: { fill: "rgba(136,19,55,0.5)", stroke: "#fb7185", text: "#ffe4ec" },
  messagebus: { fill: "rgba(124,45,18,0.55)", stroke: "#fb923c", text: "#ffedd5" },
  external: { fill: "rgba(30,41,59,0.7)", stroke: "#94a3b8", text: "#e2e8f0" }
};
var domainRolesLight = {
  frontend: { fill: "rgba(34,211,238,0.15)", stroke: "#0891b2", text: "#0e4a5b" },
  backend: { fill: "rgba(52,211,153,0.18)", stroke: "#059669", text: "#065f46" },
  database: { fill: "rgba(167,139,250,0.2)", stroke: "#7c3aed", text: "#5b21b6" },
  cloud: { fill: "rgba(251,191,36,0.2)", stroke: "#d97706", text: "#92400e" },
  security: { fill: "rgba(251,113,133,0.15)", stroke: "#e11d48", text: "#9f1239" },
  messagebus: { fill: "rgba(251,146,60,0.15)", stroke: "#ea580c", text: "#9a3412" },
  external: { fill: "rgba(148,163,184,0.2)", stroke: "#64748b", text: "#334155" }
};
var lightTokens = {
  colors: {
    background: "#f7f8fb",
    surface: "#ffffff",
    surfaceStroke: "#c7cdd9",
    text: "#1b2030",
    textMuted: "#5c6478",
    // Dark-parity edge contrast on the near-white bg (was #8a93a6 ≈ 2.9:1, too faint
    // for sketch·light + near-parallel runs). #69728a ≈ 4.5:1 on #f7f8fb, matching the
    // dark theme's edge legibility; colour-only, no geometry impact (D2=A).
    edge: "#69728a",
    edgeLabelBg: "#f7f8fb",
    edgeLabelText: "#3a4152",
    subgraphFill: "#eef1f6",
    subgraphStroke: "#c7cdd9",
    subgraphText: "#5c6478",
    accent: "#4f7cff",
    minimapBg: "rgba(240,242,247,0.9)",
    minimapViewport: "rgba(79,124,255,0.28)",
    roles: {
      ...domainRolesLight,
      accent: { fill: "#e8ecff", stroke: "#7c8bd9", text: "#1b2030" },
      success: { fill: "#e6f4ea", stroke: "#5db97a", text: "#12331f" },
      warn: { fill: "#fff3d6", stroke: "#caa54a", text: "#3b2f0b" },
      danger: { fill: "#fde8e8", stroke: "#d9534f", text: "#4a1210" }
    }
  },
  radii: { node: 10, card: 10, label: 4 },
  spacing: { nodePadX: 16, nodePadY: 12, nodesep: 40, ranksep: 60, fitPadding: 60 },
  font: { family: SANS, mono: MONO, size: 14, lineHeight: 18, weight: 500 },
  edge: { style: "elbow", width: 1.5, thickWidth: 3, arrowSize: 8 },
  effects: { nodeShadow: "0 1px 2px rgba(20,24,40,0.08)", gradient: false, hoverLift: 2 }
};
var darkTokens = {
  colors: {
    background: "#0f1117",
    surface: "#1a1f2b",
    surfaceStroke: "#3a4152",
    text: "#e7eaf2",
    textMuted: "#9aa3b8",
    edge: "#6b7488",
    edgeLabelBg: "#0f1117",
    edgeLabelText: "#c3cadb",
    subgraphFill: "#161b25",
    subgraphStroke: "#3a4152",
    subgraphText: "#9aa3b8",
    accent: "#6f9bff",
    minimapBg: "rgba(20,24,34,0.9)",
    minimapViewport: "rgba(111,155,255,0.32)",
    roles: {
      ...domainRolesDark,
      accent: { fill: "#26314f", stroke: "#6f9bff", text: "#e7eaf2" },
      success: { fill: "#183226", stroke: "#4bbf83", text: "#d6f5e4" },
      warn: { fill: "#33290f", stroke: "#d3ad4e", text: "#f7ecc9" },
      danger: { fill: "#3a1c1c", stroke: "#e06a66", text: "#ffd9d7" }
    }
  },
  radii: { node: 10, card: 10, label: 4 },
  spacing: { nodePadX: 16, nodePadY: 12, nodesep: 40, ranksep: 60, fitPadding: 60 },
  font: { family: SANS, mono: MONO, size: 14, lineHeight: 18, weight: 500 },
  edge: { style: "elbow", width: 1.5, thickWidth: 3, arrowSize: 8 },
  effects: { nodeShadow: "0 1px 3px rgba(0,0,0,0.5)", gradient: false, hoverLift: 2 }
};
var fancyTokens = {
  colors: {
    background: "#0b1020",
    surface: "#151b34",
    surfaceStroke: "#3b4a7a",
    text: "#eef1ff",
    textMuted: "#9fa9d6",
    edge: "#7d88c4",
    edgeLabelBg: "#0b1020",
    edgeLabelText: "#c8cffb",
    subgraphFill: "#111834",
    subgraphStroke: "#3b4a7a",
    subgraphText: "#9fa9d6",
    accent: "#8b6cff",
    minimapBg: "rgba(12,16,34,0.9)",
    minimapViewport: "rgba(139,108,255,0.35)",
    roles: {
      ...domainRolesDark,
      accent: { fill: "#2a2160", stroke: "#8b6cff", text: "#eef1ff" },
      success: { fill: "#123a2e", stroke: "#3fd39b", text: "#d6ffef" },
      warn: { fill: "#3a2f0f", stroke: "#e6c04d", text: "#fff4cf" },
      danger: { fill: "#3f1830", stroke: "#ff6bb0", text: "#ffd9ec" }
    }
  },
  radii: { node: 14, card: 14, label: 6 },
  spacing: { nodePadX: 18, nodePadY: 14, nodesep: 48, ranksep: 72, fitPadding: 60 },
  font: { family: SANS, mono: MONO, size: 14, lineHeight: 19, weight: 600 },
  edge: { style: "curved", width: 1.75, thickWidth: 3.5, arrowSize: 9 },
  effects: {
    nodeShadow: "0 6px 22px rgba(80,60,180,0.35)",
    gradient: true,
    hoverLift: 3
  }
};
var archTokens = {
  colors: {
    background: "#020617",
    surface: "#0f172a",
    surfaceStroke: "#334155",
    text: "#f1f5f9",
    textMuted: "#94a3b8",
    edge: "#64748b",
    edgeLabelBg: "#020617",
    edgeLabelText: "#cbd5e1",
    subgraphFill: "#0b1324",
    subgraphStroke: "#334155",
    subgraphText: "#94a3b8",
    accent: "#34d399",
    minimapBg: "rgba(2,6,23,0.9)",
    minimapViewport: "rgba(52,211,153,0.3)",
    roles: {
      ...domainRolesDark,
      accent: { fill: "rgba(14,165,233,0.18)", stroke: "#38bdf8", text: "#e0f2fe" },
      success: { fill: "rgba(6,78,59,0.55)", stroke: "#34d399", text: "#d1fae5" },
      warn: { fill: "rgba(120,53,15,0.55)", stroke: "#fbbf24", text: "#fef3c7" },
      danger: { fill: "rgba(136,19,55,0.5)", stroke: "#fb7185", text: "#ffe4e6" }
    }
  },
  radii: { node: 8, card: 8, label: 4 },
  spacing: { nodePadX: 16, nodePadY: 12, nodesep: 44, ranksep: 64, fitPadding: 60 },
  font: { family: MONO_ARCH, mono: MONO, size: 13, lineHeight: 18, weight: 500 },
  edge: { style: "elbow", width: 1.5, thickWidth: 3, arrowSize: 8 },
  effects: { nodeShadow: "0 2px 10px rgba(0,0,0,0.45)", gradient: false, hoverLift: 2, semanticEdges: true }
};
var archLightTokens = {
  colors: {
    background: "#f8fafc",
    surface: "#ffffff",
    surfaceStroke: "#cbd5e1",
    text: "#0f172a",
    textMuted: "#64748b",
    edge: "#94a3b8",
    edgeLabelBg: "#f8fafc",
    edgeLabelText: "#475569",
    subgraphFill: "#f1f5f9",
    subgraphStroke: "#cbd5e1",
    subgraphText: "#64748b",
    accent: "#059669",
    minimapBg: "rgba(248,250,252,0.9)",
    minimapViewport: "rgba(5,150,105,0.25)",
    roles: {
      ...domainRolesLight,
      accent: { fill: "rgba(2,132,199,0.12)", stroke: "#0284c7", text: "#075985" },
      success: { fill: "rgba(5,150,105,0.14)", stroke: "#059669", text: "#065f46" },
      warn: { fill: "rgba(217,119,6,0.16)", stroke: "#d97706", text: "#92400e" },
      danger: { fill: "rgba(225,29,72,0.12)", stroke: "#e11d48", text: "#9f1239" }
    }
  },
  radii: { node: 8, card: 8, label: 4 },
  spacing: { nodePadX: 16, nodePadY: 12, nodesep: 44, ranksep: 64, fitPadding: 60 },
  font: { family: MONO_ARCH, mono: MONO, size: 13, lineHeight: 18, weight: 500 },
  edge: { style: "elbow", width: 1.5, thickWidth: 3, arrowSize: 8 },
  effects: { nodeShadow: "0 1px 2px rgba(15,23,42,0.1)", gradient: false, hoverLift: 2, semanticEdges: true }
};
function makeTheme(name, tokens) {
  return {
    name,
    edgeStyle: tokens.edge.style,
    tokens,
    cssVars() {
      return themeCssVars(this.tokens);
    }
  };
}
function themeCssVars(t) {
  const c = t.colors;
  const pairs = [
    ["--vnm-bg", c.background],
    ["--vnm-surface", c.surface],
    ["--vnm-surface-stroke", c.surfaceStroke],
    ["--vnm-text", c.text],
    ["--vnm-text-muted", c.textMuted],
    ["--vnm-edge", c.edge],
    ["--vnm-edge-label-bg", c.edgeLabelBg],
    ["--vnm-edge-label-text", c.edgeLabelText],
    ["--vnm-subgraph-fill", c.subgraphFill],
    ["--vnm-subgraph-stroke", c.subgraphStroke],
    ["--vnm-subgraph-text", c.subgraphText],
    ["--vnm-accent", c.accent],
    ["--vnm-minimap-bg", c.minimapBg],
    ["--vnm-minimap-viewport", c.minimapViewport],
    ["--vnm-radius", `${t.radii.node}px`],
    ["--vnm-label-radius", `${t.radii.label}px`],
    ["--vnm-font", t.font.family],
    ["--vnm-mono", t.font.mono],
    ["--vnm-font-size", `${t.font.size}px`],
    ["--vnm-font-weight", String(t.font.weight)],
    ["--vnm-node-shadow", t.effects.nodeShadow],
    ["--vnm-hover-lift", `${t.effects.hoverLift}px`],
    ["--vnm-edge-width", `${t.edge.width}px`]
  ];
  return pairs.map(([k, v]) => `${k}: ${v};`).join(" ");
}
var themes = {
  light: makeTheme("light", lightTokens),
  dark: makeTheme("dark", darkTokens),
  fancy: makeTheme("fancy", fancyTokens),
  arch: makeTheme("arch", archTokens),
  "arch-light": makeTheme("arch-light", archLightTokens)
};
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    if (isPlainObject(value) && isPlainObject(current)) {
      out[key] = deepMerge(current, value);
    } else if (value !== void 0) {
      out[key] = value;
    }
  }
  return out;
}
function defineTheme(partial, opts = {}) {
  const base = typeof opts.base === "string" ? themes[opts.base] ?? themes.light : opts.base ?? themes.light;
  const tokens = deepMerge(base.tokens, partial);
  return makeTheme(opts.name ?? "custom", tokens);
}
function resolveTheme(input) {
  if (input === void 0) return themes.light;
  if (typeof input === "string") return themes[input] ?? themes.light;
  if ("tokens" in input && "cssVars" in input) return input;
  return defineTheme(input);
}

// src/geometry/index.ts
var PORT_MARGIN = 6;
var PORT_STEP = 30;
var PORT_LABEL_PAD = 6;
function n(value) {
  return Math.round(value * 100) / 100;
}
function clampOffset(offset, bound) {
  const max = Math.max(0, bound);
  return Math.max(-max, Math.min(max, offset));
}
function anchorBound(shape, side, hw, hh) {
  const horiz = side === "top" || side === "bottom";
  const half = horiz ? hw : hh;
  const cap = half - PORT_MARGIN;
  switch (shape) {
    case "rounded":
      return Math.min(cap, half - 14);
    case "stadium":
      return Math.min(cap, half - hh);
    case "hexagon":
      return horiz ? Math.min(cap, half - Math.min(hw * 0.44, hh)) : cap;
    case "parallelogram":
    case "parallelogram-alt":
      return horiz ? Math.min(cap, half - Math.min(hw * 0.44, 2 * hh)) : cap;
    case "cylinder":
      return horiz ? cap : Math.min(cap, half - Math.min(10, hh * 0.36));
    default:
      return cap;
  }
}
function outlinePoint(shape, side, cx, cy, hw, hh, t) {
  switch (side) {
    case "top":
    case "bottom": {
      const sgn = side === "top" ? -1 : 1;
      let y = cy + sgn * hh;
      if (shape === "diamond") y = cy + sgn * hh * (1 - Math.abs(t) / hw);
      else if (shape === "circle") y = cy + sgn * hh * Math.sqrt(1 - t / hw * (t / hw));
      else if (shape === "cylinder") {
        const ry = Math.min(10, hh * 0.36);
        y = cy + sgn * (hh - ry + ry * Math.sqrt(1 - t / hw * (t / hw)));
      }
      return { x: cx + t, y };
    }
    case "left":
    case "right": {
      const sgn = side === "left" ? -1 : 1;
      let x = cx + sgn * hw;
      if (shape === "diamond") x = cx + sgn * hw * (1 - Math.abs(t) / hh);
      else if (shape === "circle") x = cx + sgn * hw * Math.sqrt(1 - t / hh * (t / hh));
      else if (shape === "hexagon") {
        const k = Math.min(hw * 0.44, hh);
        x = cx + sgn * (hw - k * Math.abs(t) / hh);
      } else if (shape === "parallelogram") {
        const k = Math.min(hw * 0.44, 2 * hh);
        x = side === "left" ? cx - hw + k * (hh - t) / (2 * hh) : cx + hw - k * (t + hh) / (2 * hh);
      } else if (shape === "parallelogram-alt") {
        const k = Math.min(hw * 0.44, 2 * hh);
        x = side === "left" ? cx - hw + k * (t + hh) / (2 * hh) : cx + hw - k * (hh - t) / (2 * hh);
      }
      return { x, y: cy + t };
    }
  }
}
function sidePoint(box, side, offset = 0) {
  const hw = box.width / 2;
  const hh = box.height / 2;
  const shape = box.shape ?? "rect";
  const t = clampOffset(offset, anchorBound(shape, side, hw, hh));
  return outlinePoint(shape, side, box.x, box.y, hw, hh, t);
}
function raySide(box, dx, dy) {
  const sx = dx !== 0 ? box.width / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? box.height / 2 / Math.abs(dy) : Infinity;
  if (sx < sy) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}
function computePerimeterPorts(edges, boxes, labelSizes, overrides, bends) {
  const result = edges.map(() => ({
    source: { side: "bottom", offset: 0 },
    target: { side: "top", offset: 0 }
  }));
  const groups = /* @__PURE__ */ new Map();
  const groupNode = /* @__PURE__ */ new Map();
  const add = (nodeId, side, rec) => {
    const key = nodeId + "|" + side;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(rec);
    groupNode.set(key, nodeId);
  };
  const axisX = (s) => s === "top" || s === "bottom";
  edges.forEach((e, i) => {
    const from = boxes.get(e.from);
    const to = boxes.get(e.to);
    if (!from || !to) return;
    if (from === to || from.x === to.x && from.y === to.y) return;
    const exit = raySide(from, to.x - from.x, to.y - from.y);
    const entry = raySide(to, from.x - to.x, from.y - to.y);
    const wp = bends?.[i];
    const srcHead = wp && wp.length ? wp[0] : to;
    const tgtHead = wp && wp.length ? wp[wp.length - 1] : from;
    {
      result[i].source = { side: exit, offset: 0 };
      add(e.from, exit, { edgeIndex: i, role: "source", along: axisX(exit) ? srcHead.x : srcHead.y });
    }
    {
      result[i].target = { side: entry, offset: 0 };
      add(e.to, entry, { edgeIndex: i, role: "target", along: axisX(entry) ? tgtHead.x : tgtHead.y });
    }
  });
  for (const [key, recs] of groups) {
    if (recs.length < 2) continue;
    const side = key.slice(key.lastIndexOf("|") + 1);
    const box = boxes.get(groupNode.get(key));
    const borderLen = side === "top" || side === "bottom" ? box.width : box.height;
    recs.sort(
      (a, b) => a.along - b.along || a.edgeIndex - b.edgeIndex || a.role.localeCompare(b.role)
    );
    const k = recs.length;
    const step = Math.min(PORT_STEP, (borderLen - 2 * PORT_MARGIN) / (k - 1));
    recs.forEach((r, slot) => {
      result[r.edgeIndex][r.role].offset = (slot - (k - 1) / 2) * step;
    });
  }
  const deskewer = (nodeId, sideA, sideB) => {
    const ra = groups.get(nodeId + "|" + sideA);
    const rb = groups.get(nodeId + "|" + sideB);
    if (!ra || !rb || ra.length !== 1 || rb.length !== 1) return;
    const box = boxes.get(nodeId);
    const axisIsX = sideA === "top" || sideA === "bottom";
    const c = axisIsX ? box.x : box.y;
    const farOff = (rec2) => {
      const e = edges[rec2.edgeIndex];
      const fb = boxes.get(rec2.role === "target" ? e.from : e.to);
      return fb ? (axisIsX ? fb.x : fb.y) - c : void 0;
    };
    const dA = farOff(ra[0]);
    const dB = farOff(rb[0]);
    if (dA === void 0 || dB === void 0) return;
    const tol = PORT_STEP / 2;
    if (Math.sign(dA) === Math.sign(dB) || Math.abs(dA) < tol || Math.abs(dB) < tol) return;
    if ((axisIsX ? box.width : box.height) / 2 - PORT_MARGIN < tol) return;
    const rec = ra[0];
    result[rec.edgeIndex][rec.role].offset = Math.sign(dA) * tol;
  };
  for (const nodeId of new Set(groupNode.values())) {
    deskewer(nodeId, "top", "bottom");
    deskewer(nodeId, "left", "right");
  }
  if (labelSizes) computeLabelShifts(edges, boxes, labelSizes, result);
  return result;
}
function computeLabelShifts(edges, boxes, labelSizes, result) {
  const pairs = /* @__PURE__ */ new Map();
  edges.forEach((e, i) => {
    if (!labelSizes[i]) return;
    const a = boxes.get(e.from);
    const b = boxes.get(e.to);
    if (!a || !b || a.x === b.x && a.y === b.y) return;
    const key = e.from < e.to ? e.from + "|" + e.to : e.to + "|" + e.from;
    (pairs.get(key) ?? pairs.set(key, []).get(key)).push(i);
  });
  for (const idxs of pairs.values()) {
    if (idxs.length < 2) continue;
    idxs.sort((x, y) => x - y);
    const first = edges[idxs[0]];
    const a = boxes.get(first.from);
    const b = boxes.get(first.to);
    const runX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const extent = (i) => runX ? labelSizes[i].w : labelSizes[i].h;
    const pos = [0];
    for (let s = 1; s < idxs.length; s++) {
      pos.push(pos[s - 1] + (extent(idxs[s - 1]) + extent(idxs[s])) / 2 + PORT_LABEL_PAD);
    }
    const center = (pos[0] + pos[pos.length - 1]) / 2;
    idxs.forEach((i, s) => {
      const d = pos[s] - center;
      result[i].labelShift = runX ? { x: d, y: 0 } : { x: 0, y: d };
    });
  }
}
var LABEL_LINE_GAP = 3;
function homeSegment(points, cubic) {
  if (points.length < 2) return null;
  if (cubic && points.length === 4) {
    const [p0, c1, c2, p3] = points;
    return [
      { x: p0.x + c1.x, y: p0.y + c1.y },
      { x: c2.x + p3.x, y: c2.y + p3.y }
    ];
  }
  if (points.length === 2) return [points[0], points[1]];
  const mid = Math.floor(points.length / 2);
  return [points[mid - 1], points[mid]];
}
function resolveLabelLineOffsets(plates, polylines, cubics) {
  return plates.map((p, i) => {
    if (!p) return { x: 0, y: 0 };
    const seg = homeSegment(polylines[i] ?? [], cubics[i] ?? false);
    if (!seg) return { x: 0, y: 0 };
    const horizontal = Math.abs(seg[1].x - seg[0].x) >= Math.abs(seg[1].y - seg[0].y);
    const dist2 = (horizontal ? p.h : p.w) / 2 + LABEL_LINE_GAP;
    return horizontal ? { x: 0, y: -dist2 } : { x: dist2, y: 0 };
  });
}
function resolveLabelCollisions(plates) {
  const shifts = plates.map(() => ({ x: 0, y: 0 }));
  const idxs = [];
  plates.forEach((p, i) => {
    if (p) idxs.push(i);
  });
  if (idxs.length < 2) return shifts;
  const cx = plates.map((p) => p ? p.x : 0);
  const cy = plates.map((p) => p ? p.y : 0);
  const MAX_PASSES = 8;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = idxs[a];
        const j = idxs[b];
        const pi = plates[i];
        const pj = plates[j];
        const dx = cx[j] - cx[i];
        const dy = cy[j] - cy[i];
        const ox = (pi.w + pj.w) / 2 + PORT_LABEL_PAD - Math.abs(dx);
        const oy = (pi.h + pj.h) / 2 + PORT_LABEL_PAD - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox <= oy) {
          const push = ox / 2;
          const dir = dx === 0 ? 1 : Math.sign(dx);
          cx[i] = cx[i] - push * dir;
          cx[j] = cx[j] + push * dir;
        } else {
          const push = oy / 2;
          const dir = dy === 0 ? 1 : Math.sign(dy);
          cy[i] = cy[i] - push * dir;
          cy[j] = cy[j] + push * dir;
        }
      }
    }
    if (!moved) break;
  }
  for (const i of idxs) {
    shifts[i] = { x: n(cx[i] - plates[i].x), y: n(cy[i] - plates[i].y) };
  }
  return shifts;
}
var LABEL_NODE_PASSES = 4;
var LABEL_NODE_PAD = 10;
var LABEL_EDGE_PASSES = 4;
function resolveLabelNodeCollisions(plates, nodeBoxes) {
  const shifts = plates.map(() => ({ x: 0, y: 0 }));
  if (nodeBoxes.length === 0) return shifts;
  const cx = plates.map((p) => p ? p.x : 0);
  const cy = plates.map((p) => p ? p.y : 0);
  for (let pass = 0; pass < LABEL_NODE_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < plates.length; i++) {
      const p = plates[i];
      if (!p) continue;
      for (const nb of nodeBoxes) {
        const dx = cx[i] - nb.x;
        const dy = cy[i] - nb.y;
        const ox = (p.w + nb.width) / 2 + LABEL_NODE_PAD - Math.abs(dx);
        const oy = (p.h + nb.height) / 2 + LABEL_NODE_PAD - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (oy <= ox) {
          cy[i] = cy[i] + oy * (dy < 0 ? -1 : 1);
        } else {
          cx[i] = cx[i] + ox * (dx < 0 ? -1 : 1);
        }
      }
    }
    if (!moved) break;
  }
  for (let i = 0; i < plates.length; i++) {
    if (plates[i]) shifts[i] = { x: n(cx[i] - plates[i].x), y: n(cy[i] - plates[i].y) };
  }
  return shifts;
}
function nearestRunAxis(points, cx, cy) {
  let best = Infinity;
  let axis = null;
  for (let s = 0; s + 1 < points.length; s++) {
    const a = points[s];
    const b = points[s + 1];
    const horiz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5;
    const vert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 0.5;
    if (!horiz && !vert) continue;
    let dx;
    let dy;
    if (horiz) {
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      dx = cx < lo ? cx - lo : cx > hi ? cx - hi : 0;
      dy = cy - a.y;
    } else {
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      dx = cx - a.x;
      dy = cy < lo ? cy - lo : cy > hi ? cy - hi : 0;
    }
    const dd = dx * dx + dy * dy;
    if (dd < best) {
      best = dd;
      axis = horiz ? "x" : "y";
    }
  }
  return axis;
}
function resolveLabelEdgeCollisions(plates, polylines) {
  const shifts = plates.map(() => ({ x: 0, y: 0 }));
  const cx = plates.map((p) => p ? p.x : 0);
  const cy = plates.map((p) => p ? p.y : 0);
  for (let pass = 0; pass < LABEL_EDGE_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < plates.length; i++) {
      const p = plates[i];
      if (!p) continue;
      const axis = nearestRunAxis(polylines[i] ?? [], cx[i], cy[i]);
      if (!axis) continue;
      const hw = p.w / 2;
      const hh = p.h / 2;
      let hasHit = false;
      let hiTarget = -Infinity;
      let loTarget = Infinity;
      for (let j = 0; j < polylines.length; j++) {
        if (j === i) continue;
        const pts = polylines[j] ?? [];
        for (let s = 0; s + 1 < pts.length; s++) {
          const a = pts[s];
          const b = pts[s + 1];
          if (axis === "x") {
            if (Math.abs(a.x - b.x) < 0.5) {
              const gx = a.x;
              if (gx <= cx[i] - hw || gx >= cx[i] + hw) continue;
              if (cy[i] + hh <= Math.min(a.y, b.y) || cy[i] - hh >= Math.max(a.y, b.y)) continue;
              hasHit = true;
              hiTarget = Math.max(hiTarget, gx + hw + PORT_LABEL_PAD);
              loTarget = Math.min(loTarget, gx - hw - PORT_LABEL_PAD);
            } else if (Math.abs(a.y - b.y) < 0.5) {
              const gy = a.y;
              if (gy <= cy[i] - hh || gy >= cy[i] + hh) continue;
              const lo = Math.min(a.x, b.x);
              const hi = Math.max(a.x, b.x);
              if (cx[i] + hw <= lo || cx[i] - hw >= hi) continue;
              hasHit = true;
              hiTarget = Math.max(hiTarget, hi + hw + PORT_LABEL_PAD);
              loTarget = Math.min(loTarget, lo - hw - PORT_LABEL_PAD);
            }
          } else {
            if (Math.abs(a.y - b.y) < 0.5) {
              const gy = a.y;
              if (gy <= cy[i] - hh || gy >= cy[i] + hh) continue;
              if (cx[i] + hw <= Math.min(a.x, b.x) || cx[i] - hw >= Math.max(a.x, b.x)) continue;
              hasHit = true;
              hiTarget = Math.max(hiTarget, gy + hh + PORT_LABEL_PAD);
              loTarget = Math.min(loTarget, gy - hh - PORT_LABEL_PAD);
            } else if (Math.abs(a.x - b.x) < 0.5) {
              const gx = a.x;
              if (gx <= cx[i] - hw || gx >= cx[i] + hw) continue;
              const lo = Math.min(a.y, b.y);
              const hi = Math.max(a.y, b.y);
              if (cy[i] + hh <= lo || cy[i] - hh >= hi) continue;
              hasHit = true;
              hiTarget = Math.max(hiTarget, hi + hh + PORT_LABEL_PAD);
              loTarget = Math.min(loTarget, lo - hh - PORT_LABEL_PAD);
            }
          }
        }
      }
      if (!hasHit) continue;
      const cur = axis === "x" ? cx[i] : cy[i];
      const target = hiTarget - cur <= cur - loTarget ? hiTarget : loTarget;
      if (axis === "x") cx[i] = target;
      else cy[i] = target;
      moved = true;
    }
    if (!moved) break;
  }
  for (let i = 0; i < plates.length; i++) {
    if (plates[i]) shifts[i] = { x: n(cx[i] - plates[i].x), y: n(cy[i] - plates[i].y) };
  }
  return shifts;
}
var GAP_RADIUS = 4;
function segmentsCross(a1, a2, b1, b2) {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denom = rx * sy - ry * sx;
  if (denom === 0) return null;
  const qpx = b1.x - a1.x;
  const qpy = b1.y - a1.y;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  const EPS = 1e-6;
  if (t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS) {
    return { x: a1.x + t * rx, y: a1.y + t * ry };
  }
  return null;
}
function applyEdgeBridges(edges, enabled) {
  const out = edges.map(() => null);
  if (!enabled) return out;
  const polys = edges.map((e) => e.points.map((p) => ({ x: n(p.x), y: n(p.y) })));
  const gaps = edges.map(() => []);
  for (let i = 0; i < polys.length; i++) {
    const pi = polys[i];
    if (pi.length < 2) continue;
    for (let j = i + 1; j < polys.length; j++) {
      const pj = polys[j];
      if (pj.length < 2) continue;
      for (let si = 0; si + 1 < pi.length; si++) {
        const a1 = pi[si];
        const a2 = pi[si + 1];
        for (let sj = 0; sj + 1 < pj.length; sj++) {
          const b1 = pj[sj];
          const b2 = pj[sj + 1];
          const x = segmentsCross(a1, a2, b1, b2);
          if (!x) continue;
          const horizI = Math.abs(a2.x - a1.x) >= Math.abs(a2.y - a1.y);
          const horizJ = Math.abs(b2.x - b1.x) >= Math.abs(b2.y - b1.y);
          const iGaps = horizI === horizJ ? true : !horizI;
          const ge = iGaps ? i : j;
          const gs = iGaps ? si : sj;
          const s1 = iGaps ? a1 : b1;
          const s2 = iGaps ? a2 : b2;
          const dEntry = Math.hypot(x.x - s1.x, x.y - s1.y);
          const dExit = Math.hypot(x.x - s2.x, x.y - s2.y);
          if (dEntry < GAP_RADIUS || dExit < GAP_RADIUS) continue;
          gaps[ge].push({ seg: gs, at: x, dist: dEntry });
        }
      }
    }
  }
  for (let e = 0; e < edges.length; e++) {
    if (gaps[e].length > 0) out[e] = gappedPath(polys[e], gaps[e]);
  }
  return out;
}
function gappedPath(points, gaps) {
  const bySeg = /* @__PURE__ */ new Map();
  for (const g of gaps) (bySeg.get(g.seg) ?? bySeg.set(g.seg, []).get(g.seg)).push({ at: g.at, dist: g.dist });
  for (const arr of bySeg.values()) arr.sort((p, q) => p.dist - q.dist);
  let d = `M ${n(points[0].x)} ${n(points[0].y)}`;
  for (let s = 0; s + 1 < points.length; s++) {
    const p = points[s];
    const q = points[s + 1];
    const segGaps = bySeg.get(s);
    if (!segGaps || segGaps.length === 0) {
      d += ` L ${n(q.x)} ${n(q.y)}`;
      continue;
    }
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const ux = (q.x - p.x) / len;
    const uy = (q.y - p.y) / len;
    let lastGapDist = -Infinity;
    for (const g of segGaps) {
      if (g.dist - lastGapDist < 2 * GAP_RADIUS) continue;
      lastGapDist = g.dist;
      const ex = g.at.x - ux * GAP_RADIUS;
      const ey = g.at.y - uy * GAP_RADIUS;
      const xx = g.at.x + ux * GAP_RADIUS;
      const xy = g.at.y + uy * GAP_RADIUS;
      d += ` L ${n(ex)} ${n(ey)} M ${n(xx)} ${n(xy)}`;
    }
    d += ` L ${n(q.x)} ${n(q.y)}`;
  }
  return d;
}
var LANE_GAP = 26;
var LANE_MIN_OVERLAP = 40;
var LANE_PASSES = 8;
function separateLanes(edges, style) {
  if (style !== "elbow" && style !== "curved") return;
  const moved = /* @__PURE__ */ new Set();
  for (let pass = 0; pass < LANE_PASSES; pass++) {
    let changed = false;
    for (const vertical of [true, false]) {
      const segs = [];
      edges.forEach((e, ei) => {
        const p = e.points;
        for (let i = 1; i + 2 < p.length; i++) {
          const a = p[i];
          const b = p[i + 1];
          const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
          const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
          if (vertical ? !isVert : !isHorz) continue;
          const along2 = vertical ? a.x : a.y;
          const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
          const hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
          segs.push({ edge: ei, i, along: along2, lo, hi });
        }
      });
      segs.sort((s, t) => s.along - t.along || s.edge - t.edge || s.i - t.i);
      for (let a = 0; a < segs.length; a++) {
        for (let b = a + 1; b < segs.length; b++) {
          const sa = segs[a];
          const sb = segs[b];
          if (sa.edge === sb.edge) continue;
          if (Math.min(sa.hi, sb.hi) - Math.max(sa.lo, sb.lo) < LANE_MIN_OVERLAP) continue;
          const d = LANE_GAP - Math.abs(sb.along - sa.along);
          if (d <= 1e-6) continue;
          const dir = sb.along >= sa.along ? 1 : -1;
          const push = d / 2;
          moveLane(edges[sa.edge], vertical, sa, n(sa.along - push * dir));
          moveLane(edges[sb.edge], vertical, sb, n(sb.along + push * dir));
          moved.add(sa.edge);
          moved.add(sb.edge);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  for (const ei of moved) edges[ei].path = orthoPath(edges[ei].points, style);
}
function moveLane(e, vertical, seg, target) {
  const p = e.points;
  if (vertical) {
    shiftLabelOnSeg(e, true, seg, target);
    p[seg.i] = { x: target, y: p[seg.i].y };
    p[seg.i + 1] = { x: target, y: p[seg.i + 1].y };
  } else {
    shiftLabelOnSeg(e, false, seg, target);
    p[seg.i] = { x: p[seg.i].x, y: target };
    p[seg.i + 1] = { x: p[seg.i + 1].x, y: target };
  }
  seg.along = target;
}
function shiftLabelOnSeg(e, vertical, seg, target) {
  const lp = e.labelPos;
  if (!lp) return;
  if (vertical) {
    if (Math.abs(lp.x - seg.along) < LANE_GAP && lp.y >= seg.lo - 1 && lp.y <= seg.hi + 1) {
      e.labelPos = { x: n(lp.x + (target - seg.along)), y: lp.y };
    }
  } else if (Math.abs(lp.y - seg.along) < LANE_GAP && lp.x >= seg.lo - 1 && lp.x <= seg.hi + 1) {
    e.labelPos = { x: lp.x, y: n(lp.y + (target - seg.along)) };
  }
}
var JOG_GAP = 26;
var CONVERGE_MIN = 3;
function separateAntiParallelJogs(edges, style) {
  if (style !== "elbow") return;
  const pairs = /* @__PURE__ */ new Map();
  edges.forEach((e, i) => {
    const key = e.from < e.to ? e.from + "|" + e.to : e.to + "|" + e.from;
    (pairs.get(key) ?? pairs.set(key, []).get(key)).push(i);
  });
  const moved = /* @__PURE__ */ new Set();
  for (const idxs of pairs.values()) {
    if (idxs.length < 2) continue;
    idxs.sort((a, b) => a - b);
    const jogs = [];
    let orient;
    for (const ei of idxs) {
      const p = edges[ei].points;
      let jog;
      for (let i = 1; i + 2 < p.length; i++) {
        const a = p[i];
        const b = p[i + 1];
        const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
        const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
        if (!isVert && !isHorz) continue;
        const along2 = isVert ? a.x : a.y;
        const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
        const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
        const end = p[p.length - 1];
        const target = isVert ? end.x : end.y;
        jog = { edge: ei, seg: { edge: ei, i, along: along2, lo, hi }, vertical: isVert, target };
        break;
      }
      if (!jog) break;
      if (orient === void 0) orient = jog.vertical;
      else if (orient !== jog.vertical) {
        jogs.length = 0;
        break;
      }
      jogs.push(jog);
    }
    if (jogs.length < 2) continue;
    const a0 = jogs[0].seg.along;
    if (!jogs.every((j) => Math.abs(j.seg.along - a0) < 1)) continue;
    jogs.sort((x, y) => x.target - y.target || x.edge - y.edge);
    const mean = jogs.reduce((s, j) => s + j.seg.along, 0) / jogs.length;
    const k = jogs.length;
    jogs.forEach((j, s) => {
      const lane = n(mean + (s - (k - 1) / 2) * JOG_GAP);
      if (Math.abs(lane - j.seg.along) < 1e-6) return;
      moveLane(edges[j.edge], j.vertical, j.seg, lane);
      moved.add(j.edge);
    });
  }
  for (const ei of moved) edges[ei].path = toPath(edges[ei].points, "elbow");
}
function separateConvergentJogs(edges, style) {
  if (style !== "elbow") return;
  const jogOf = (p, role) => {
    const len = p.length;
    if (len < 4) return null;
    const i = role === "target" ? len - 3 : 1;
    if (i < 1 || i + 2 > len) return null;
    const a = p[i];
    const b = p[i + 1];
    const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
    const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
    if (!isVert && !isHorz) return null;
    const along2 = isVert ? a.x : a.y;
    const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
    const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
    const appFrom = role === "target" ? p[i + 1] : p[1];
    const appTo = role === "target" ? p[len - 1] : p[0];
    const toward = isVert ? Math.sign(appTo.x - appFrom.x) : Math.sign(appTo.y - appFrom.y);
    const end = role === "target" ? p[0] : p[len - 1];
    const far = isVert ? end.x : end.y;
    return { seg: { edge: 0, i, along: along2, lo, hi }, vertical: isVert, toward, far };
  };
  const buckets = /* @__PURE__ */ new Map();
  edges.forEach((e, idx) => {
    for (const [role, node] of [
      ["source", e.from],
      ["target", e.to]
    ]) {
      const j = jogOf(e.points, role);
      if (!j) continue;
      const key = node + "|" + (j.vertical ? "V" : "H") + "|" + j.toward + "|" + n(j.seg.along);
      const rec = { edge: idx, seg: { ...j.seg, edge: idx }, vertical: j.vertical, toward: j.toward, far: j.far };
      (buckets.get(key) ?? buckets.set(key, []).get(key)).push(rec);
    }
  });
  const moved = /* @__PURE__ */ new Set();
  for (const recs of buckets.values()) {
    if (recs.length < CONVERGE_MIN) continue;
    recs.sort((x, y) => x.far - y.far || x.edge - y.edge);
    const mean = recs.reduce((s, r) => s + r.seg.along, 0) / recs.length;
    const k = recs.length;
    const toward = recs[0].toward;
    recs.forEach((r, s) => {
      const lane = n(mean + (s - (k - 1) / 2 - toward * (k - 1) / 2) * JOG_GAP);
      if (Math.abs(lane - r.seg.along) < 1e-6) return;
      moveLane(edges[r.edge], r.vertical, r.seg, lane);
      moved.add(r.edge);
    });
  }
  for (const ei of moved) edges[ei].path = toPath(edges[ei].points, "elbow");
}
var SUBGRAPH_AVOID_MARGIN = 28;
var SUBGRAPH_AVOID_MIN_CROSS = 120;
var SUBGRAPH_AVOID_APPROACH = 30;
function avoidSubgraphs(edges, containers, style) {
  if (style !== "elbow" || containers.length === 0) return;
  const moved = /* @__PURE__ */ new Set();
  edges.forEach((e, ei) => {
    const p = e.points;
    const len = p.length;
    if (len < 4) return;
    let best;
    for (let i = 1; i + 2 < len; i++) {
      const a = p[i];
      const b = p[i + 1];
      const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
      const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
      if (!isVert && !isHorz) continue;
      const along2 = isVert ? a.x : a.y;
      const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
      const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
      const runLen = hi - lo;
      for (const c of containers) {
        if (c.members.has(e.from) && c.members.has(e.to)) continue;
        if (i === 1 && c.members.has(e.from) || i === len - 3 && c.members.has(e.to)) continue;
        const cx0 = c.box.x - c.box.width / 2;
        const cx1 = c.box.x + c.box.width / 2;
        const cy0 = c.box.y - c.box.height / 2;
        const cy1 = c.box.y + c.box.height / 2;
        const perpLo = isVert ? cx0 : cy0;
        const perpHi = isVert ? cx1 : cy1;
        const parLo = isVert ? cy0 : cx0;
        const parHi = isVert ? cy1 : cx1;
        if (along2 <= perpLo || along2 >= perpHi) continue;
        if (Math.min(hi, parHi) - Math.max(lo, parLo) < SUBGRAPH_AVOID_MIN_CROSS) continue;
        const side = along2 - perpLo <= perpHi - along2 ? n(perpLo - SUBGRAPH_AVOID_MARGIN) : n(perpHi + SUBGRAPH_AVOID_MARGIN);
        if (!best || runLen > best.runLen) best = { i, vertical: isVert, along: along2, lo, hi, side, container: c, runLen };
      }
    }
    if (!best) return;
    moveLane(e, best.vertical, { i: best.i, along: best.along, lo: best.lo, hi: best.hi }, best.side);
    moved.add(ei);
    if (best.container.members.has(e.from)) lowerReentry(p, best.i, best.i - 1, p[0], best.vertical);
    if (best.container.members.has(e.to)) lowerReentry(p, best.i + 1, best.i + 2, p[len - 1], best.vertical);
  });
  for (const ei of moved) edges[ei].path = toPath(edges[ei].points, "elbow");
}
var NODE_AVOID_MARGIN = 14;
var NODE_AVOID_MIN_CROSS = 14;
var NODE_AVOID_PASSES = 4;
function isOrthogonalRoute(pts) {
  for (let i = 0; i + 1 < pts.length; i++) {
    if (Math.abs(pts[i].x - pts[i + 1].x) >= 0.5 && Math.abs(pts[i].y - pts[i + 1].y) >= 0.5) return false;
  }
  return true;
}
function orthoPath(pts, style) {
  return style === "curved" ? roundedPath(pts) : toPath(pts, "elbow");
}
function avoidNodes(edges, nodeBoxes, style) {
  if (nodeBoxes.length === 0) return;
  const moved = /* @__PURE__ */ new Set();
  edges.forEach((e, ei) => {
    const p = e.points;
    const len = p.length;
    if (len < 4 || style === "curved" && !isOrthogonalRoute(p)) return;
    let best;
    for (let i = 1; i + 2 < len; i++) {
      const a = p[i];
      const b = p[i + 1];
      const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
      const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
      if (!isVert && !isHorz) continue;
      const along2 = isVert ? a.x : a.y;
      const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
      const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
      const runLen = hi - lo;
      for (const nb of nodeBoxes) {
        if (nb.id === e.from || nb.id === e.to) continue;
        const cx0 = nb.x - nb.width / 2;
        const cx1 = nb.x + nb.width / 2;
        const cy0 = nb.y - nb.height / 2;
        const cy1 = nb.y + nb.height / 2;
        const perpLo = isVert ? cx0 : cy0;
        const perpHi = isVert ? cx1 : cy1;
        const parLo = isVert ? cy0 : cx0;
        const parHi = isVert ? cy1 : cx1;
        if (along2 <= perpLo || along2 >= perpHi) continue;
        if (Math.min(hi, parHi) - Math.max(lo, parLo) < NODE_AVOID_MIN_CROSS) continue;
        const side = along2 - perpLo <= perpHi - along2 ? n(perpLo - NODE_AVOID_MARGIN) : n(perpHi + NODE_AVOID_MARGIN);
        if (!best || runLen > best.runLen) best = { i, vertical: isVert, along: along2, lo, hi, side, runLen };
      }
    }
    if (!best) return;
    moveLane(e, best.vertical, { i: best.i, along: best.along, lo: best.lo, hi: best.hi }, best.side);
    moved.add(ei);
  });
  for (const ei of moved) edges[ei].path = orthoPath(edges[ei].points, style);
}
function detourApproaches(edges, nodeBoxes, style) {
  if (nodeBoxes.length === 0) return;
  const spans = (nb) => ({
    l: nb.x - nb.width / 2,
    r: nb.x + nb.width / 2,
    t: nb.y - nb.height / 2,
    b: nb.y + nb.height / 2
  });
  const detour = (a, pp, nb) => {
    const s = spans(nb);
    if (Math.abs(a.x - pp.x) < 0.5) {
      const sideX = a.x - s.l <= s.r - a.x ? n(s.l - NODE_AVOID_MARGIN) : n(s.r + NODE_AVOID_MARGIN);
      const gapY = pp.y > a.y ? n(s.b + NODE_AVOID_MARGIN) : n(s.t - NODE_AVOID_MARGIN);
      return [{ x: sideX, y: a.y }, { x: sideX, y: gapY }, { x: n(a.x), y: gapY }];
    }
    const sideY = a.y - s.t <= s.b - a.y ? n(s.t - NODE_AVOID_MARGIN) : n(s.b + NODE_AVOID_MARGIN);
    const gapX = pp.x > a.x ? n(s.r + NODE_AVOID_MARGIN) : n(s.l - NODE_AVOID_MARGIN);
    return [{ x: a.x, y: sideY }, { x: gapX, y: sideY }, { x: gapX, y: n(a.y) }];
  };
  const pierces = (a, pp, nb) => {
    const s = spans(nb);
    const vert = Math.abs(a.x - pp.x) < 0.5;
    if (!vert && Math.abs(a.y - pp.y) >= 0.5) return false;
    const along2 = vert ? a.x : a.y;
    const lo = vert ? Math.min(a.y, pp.y) : Math.min(a.x, pp.x);
    const hi = vert ? Math.max(a.y, pp.y) : Math.max(a.x, pp.x);
    const perpLo = vert ? s.l : s.t;
    const perpHi = vert ? s.r : s.b;
    const parLo = vert ? s.t : s.l;
    const parHi = vert ? s.b : s.r;
    if (along2 <= perpLo || along2 >= perpHi) return false;
    return Math.min(hi, parHi) - Math.max(lo, parLo) >= NODE_AVOID_MIN_CROSS;
  };
  const changed = /* @__PURE__ */ new Set();
  edges.forEach((e, ei) => {
    const p = e.points;
    if (p.length < 2 || style === "curved" && !isOrthogonalRoute(p)) return;
    const a = p[p.length - 2];
    const port = p[p.length - 1];
    for (const nb of nodeBoxes) {
      if (nb.id === e.from || nb.id === e.to) continue;
      if (pierces(a, port, nb)) {
        p.splice(p.length - 1, 0, ...detour(a, port, nb));
        changed.add(ei);
        break;
      }
    }
  });
  for (const ei of changed) {
    const sp = simplify(edges[ei].points);
    edges[ei].points.splice(0, edges[ei].points.length, ...sp);
    edges[ei].path = orthoPath(edges[ei].points, style);
  }
}
function trimEndpointReentry(edges, nodeBoxes, style, pinned) {
  const boxById = /* @__PURE__ */ new Map();
  for (const b of nodeBoxes) if (b.id) boxById.set(b.id, b);
  const inside = (pt, b) => pt.x > b.x - b.width / 2 + 0.5 && pt.x < b.x + b.width / 2 - 0.5 && pt.y > b.y - b.height / 2 + 0.5 && pt.y < b.y + b.height / 2 - 0.5;
  const cross = (inPt, outPt, b) => Math.abs(inPt.x - outPt.x) < 0.5 ? { x: n(inPt.x), y: n(outPt.y > inPt.y ? b.y + b.height / 2 : b.y - b.height / 2) } : { x: n(outPt.x > inPt.x ? b.x + b.width / 2 : b.x - b.width / 2), y: n(inPt.y) };
  edges.forEach((e, ei) => {
    const p = e.points;
    if (p.length < 3 || style === "curved" && !isOrthogonalRoute(p)) return;
    const src = boxById.get(e.from);
    const tgt = boxById.get(e.to);
    let did = false;
    if (src && inside(p[1], src)) {
      let k = 1;
      while (k < p.length && inside(p[k], src)) k++;
      if (k < p.length) {
        p.splice(0, k, cross(p[k - 1], p[k], src));
        did = true;
      }
    }
    if (tgt && p.length >= 3 && inside(p[p.length - 2], tgt)) {
      let j = p.length - 2;
      while (j >= 0 && inside(p[j], tgt)) j--;
      if (j >= 0) {
        p.splice(j + 1, p.length - 1 - j, cross(p[j + 1], p[j], tgt));
        did = true;
      }
    }
    if (did) {
      const sp = simplify(p);
      p.splice(0, p.length, ...sp);
      e.path = orthoPath(p, style);
    }
  });
}
function lowerReentry(p, trunkEndIdx, cornerIdx, anchor, vertical) {
  if (cornerIdx < 0 || cornerIdx >= p.length || trunkEndIdx < 0 || trunkEndIdx >= p.length) return;
  const anchorPar = vertical ? anchor.y : anchor.x;
  const cornerOld = vertical ? p[cornerIdx].y : p[cornerIdx].x;
  const dir = Math.sign(cornerOld - anchorPar);
  if (dir === 0) return;
  const target = n(anchorPar + dir * SUBGRAPH_AVOID_APPROACH);
  if (Math.abs(target - anchorPar) >= Math.abs(cornerOld - anchorPar)) return;
  if (vertical) {
    p[cornerIdx] = { x: p[cornerIdx].x, y: target };
    p[trunkEndIdx] = { x: p[trunkEndIdx].x, y: target };
  } else {
    p[cornerIdx] = { x: target, y: p[cornerIdx].y };
    p[trunkEndIdx] = { x: target, y: p[trunkEndIdx].y };
  }
}
var isHorizontalLayout = (d) => d === "LR" || d === "RL";
function pickSides(from, to, direction) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let axis;
  if (isHorizontalLayout(direction)) {
    axis = Math.abs(dx) >= Math.abs(dy) * 0.5 ? "x" : "y";
  } else {
    axis = Math.abs(dy) >= Math.abs(dx) * 0.5 ? "y" : "x";
  }
  if (axis === "x") {
    return dx >= 0 ? { exit: "right", entry: "left" } : { exit: "left", entry: "right" };
  }
  return dy >= 0 ? { exit: "bottom", entry: "top" } : { exit: "top", entry: "bottom" };
}
function simplify(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && n(last.x) === n(p.x) && n(last.y) === n(p.y)) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    const collinear = n(a.x) === n(b.x) && n(b.x) === n(c.x) || n(a.y) === n(b.y) && n(b.y) === n(c.y);
    if (collinear) out.splice(i, 1);
  }
  return out;
}
var WAYPOINT_SNAP = 2;
function snapWaypoints(interior, start, end) {
  const xs = [start.x, end.x];
  const ys = [start.y, end.y];
  return interior.map((p) => {
    let { x, y } = p;
    for (const ax of xs) {
      if (Math.abs(x - ax) <= WAYPOINT_SNAP) {
        x = ax;
        break;
      }
    }
    for (const ay of ys) {
      if (Math.abs(y - ay) <= WAYPOINT_SNAP) {
        y = ay;
        break;
      }
    }
    return { x, y };
  });
}
function elbowThrough(start, end, interior, sides) {
  const guide = [start, ...snapWaypoints(interior, start, end), end];
  const out = [guide[0]];
  for (let i = 1; i < guide.length; i++) {
    const prev = out[out.length - 1];
    const cur = guide[i];
    if (n(prev.x) !== n(cur.x) && n(prev.y) !== n(cur.y)) {
      let verticalFirst;
      if (i === 1) verticalFirst = sides.exitVertical;
      else if (i === guide.length - 1) verticalFirst = !sides.entryVertical;
      else verticalFirst = sides.primaryVertical;
      out.push(verticalFirst ? { x: prev.x, y: cur.y } : { x: cur.x, y: prev.y });
    }
    out.push(cur);
  }
  perpendicularizeEntry(out, sides.entryVertical);
  return simplify(out);
}
function perpendicularizeEntry(out, entryVertical) {
  if (out.length < 3) return;
  const end = out[out.length - 1];
  const a = out[out.length - 3];
  const b = out[out.length - 2];
  const finalPerp = entryVertical ? n(b.x) === n(end.x) : n(b.y) === n(end.y);
  const swappable = entryVertical ? n(a.y) !== n(end.y) : n(a.x) !== n(end.x);
  if (!finalPerp && swappable) {
    out[out.length - 2] = entryVertical ? { x: end.x, y: a.y } : { x: a.x, y: end.y };
  }
}
function resolveEnds(from, to, direction, ports) {
  if (ports) {
    const exit2 = ports.source.side;
    const entry2 = ports.target.side;
    return {
      exit: exit2,
      entry: entry2,
      start: sidePoint(from, exit2, ports.source.offset),
      end: sidePoint(to, entry2, ports.target.offset)
    };
  }
  const { exit, entry } = pickSides(from, to, direction);
  return { exit, entry, start: sidePoint(from, exit), end: sidePoint(to, entry) };
}
function routeElbow(from, to, direction, waypoints = [], ports) {
  if (from === to || from.x === to.x && from.y === to.y) {
    return selfLoop(from);
  }
  const { exit, entry, start, end } = resolveEnds(from, to, direction, ports);
  const horizontal = exit === "left" || exit === "right";
  const entryVertical = entry === "top" || entry === "bottom";
  if (waypoints.length > 0) {
    return elbowThrough(start, end, waypoints, {
      exitVertical: !horizontal,
      entryVertical,
      primaryVertical: !isHorizontalLayout(direction)
    });
  }
  let points;
  if (horizontal) {
    const midX = (start.x + end.x) / 2;
    points = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  } else {
    const midY = (start.y + end.y) / 2;
    points = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
  }
  perpendicularizeEntry(points, entryVertical);
  return simplify(points);
}
function routeCurved(from, to, direction, ports) {
  if (from === to || from.x === to.x && from.y === to.y) {
    return selfLoop(from);
  }
  const { exit, entry, start, end } = resolveEnds(from, to, direction, ports);
  const horizontal = exit === "left" || exit === "right";
  const k = horizontal ? Math.max(24, Math.abs(end.x - start.x) * 0.5) : Math.max(24, Math.abs(end.y - start.y) * 0.5);
  const c1 = offsetAlong(start, exit, k);
  const c2 = offsetAlong(end, entry, k);
  return [start, c1, c2, end];
}
function offsetAlong(p, side, k) {
  switch (side) {
    case "top":
      return { x: p.x, y: p.y - k };
    case "bottom":
      return { x: p.x, y: p.y + k };
    case "left":
      return { x: p.x - k, y: p.y };
    case "right":
      return { x: p.x + k, y: p.y };
  }
}
function selfLoop(box) {
  const r = sidePoint(box, "right");
  const t = sidePoint(box, "top");
  const off = Math.max(24, box.height * 0.6);
  return [
    r,
    { x: r.x + off, y: r.y },
    { x: r.x + off, y: t.y - off },
    { x: t.x, y: t.y - off },
    t
  ];
}
function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function along(from, toward, r) {
  const d = dist(from, toward) || 1;
  return {
    x: from.x + (toward.x - from.x) * r / d,
    y: from.y + (toward.y - from.y) * r / d
  };
}
function roundedPath(points, radius = 12) {
  if (points.length <= 2) return toPath(points, "elbow");
  let d = `M ${n(points[0].x)} ${n(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const r = Math.min(radius, dist(prev, cur) / 2, dist(cur, next) / 2);
    const a = along(cur, prev, r);
    const b = along(cur, next, r);
    d += ` L ${n(a.x)} ${n(a.y)} Q ${n(cur.x)} ${n(cur.y)} ${n(b.x)} ${n(b.y)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${n(last.x)} ${n(last.y)}`;
  return d;
}
function toPath(points, style) {
  if (points.length === 0) return "";
  const first = points[0];
  if (style === "curved" && points.length === 4) {
    const [, c1, c2, end] = points;
    return `M ${n(first.x)} ${n(first.y)} C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(
      c2.y
    )} ${n(end.x)} ${n(end.y)}`;
  }
  let d = `M ${n(first.x)} ${n(first.y)}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    d += ` L ${n(p.x)} ${n(p.y)}`;
  }
  return d;
}
function labelPoint(points, style) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (style === "curved" && points.length === 4) {
    const [p0, c1, c2, p3] = points;
    return {
      x: n(0.125 * p0.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p3.x),
      y: n(0.125 * p0.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p3.y)
    };
  }
  if (points.length === 2) {
    return {
      x: n((points[0].x + points[1].x) / 2),
      y: n((points[0].y + points[1].y) / 2)
    };
  }
  const mid = Math.floor(points.length / 2);
  const a = points[mid - 1];
  const b = points[mid];
  return { x: n((a.x + b.x) / 2), y: n((a.y + b.y) / 2) };
}
function routeEdge(from, to, direction, style, waypoints = [], ports) {
  const selfish = from === to || from.x === to.x && from.y === to.y;
  const shift = ports?.labelShift;
  const lp = (p) => shift ? { x: p.x + shift.x, y: p.y + shift.y } : p;
  if (style === "curved" && waypoints.length > 0 && !selfish) {
    const points2 = routeElbow(from, to, direction, waypoints, ports);
    return { points: points2, path: roundedPath(points2), labelPos: lp(labelPoint(points2, "elbow")) };
  }
  if (style === "curved") {
    const points2 = routeCurved(from, to, direction, ports);
    return { points: points2, path: toPath(points2, "curved"), labelPos: lp(labelPoint(points2, "curved")) };
  }
  const points = routeElbow(from, to, direction, waypoints, ports);
  return { points, path: toPath(points, "elbow"), labelPos: lp(labelPoint(points, "elbow")) };
}
var SUBGRAPH_PADDING = 14;
var SUBGRAPH_TITLE_BAND = 22;
function subgraphBox(memberBoxes, hasTitle) {
  if (memberBoxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of memberBoxes) {
    minX = Math.min(minX, b.x - b.width / 2);
    minY = Math.min(minY, b.y - b.height / 2);
    maxX = Math.max(maxX, b.x + b.width / 2);
    maxY = Math.max(maxY, b.y + b.height / 2);
  }
  const top = SUBGRAPH_PADDING + (hasTitle ? SUBGRAPH_TITLE_BAND : 0);
  const x0 = minX - SUBGRAPH_PADDING;
  const y0 = minY - top;
  const x1 = maxX + SUBGRAPH_PADDING;
  const y1 = maxY + SUBGRAPH_PADDING;
  return { x: n((x0 + x1) / 2), y: n((y0 + y1) / 2), width: n(x1 - x0), height: n(y1 - y0) };
}
function resolveMemberNodes(id, childrenById, isNode, seen) {
  const out = [];
  for (const child of childrenById.get(id) ?? []) {
    if (isNode(child)) out.push(child);
    else if (childrenById.has(child) && !seen.has(child)) {
      seen.add(child);
      out.push(...resolveMemberNodes(child, childrenById, isNode, seen));
    }
  }
  return out;
}
function computeSubgraphBoxes(subgraphs, nodeBoxes) {
  const childrenById = new Map(subgraphs.map((sg) => [sg.id, sg.children]));
  const isNode = (id) => nodeBoxes.has(id);
  const result = /* @__PURE__ */ new Map();
  for (const sg of subgraphs) {
    const memberIds = resolveMemberNodes(sg.id, childrenById, isNode, /* @__PURE__ */ new Set([sg.id]));
    const memberBoxes = memberIds.map((id) => nodeBoxes.get(id));
    const box = subgraphBox(memberBoxes, !!sg.title);
    result.set(sg.id, box ?? { x: sg.x, y: sg.y, width: sg.width, height: sg.height });
  }
  return result;
}
function computeAvoidContainers(subgraphs, nodeBoxes) {
  const childrenById = new Map(subgraphs.map((sg) => [sg.id, sg.children]));
  const isNode = (id) => nodeBoxes.has(id);
  const boxes = computeSubgraphBoxes(subgraphs, nodeBoxes);
  const out = [];
  for (const sg of subgraphs) {
    const memberIds = resolveMemberNodes(sg.id, childrenById, isNode, /* @__PURE__ */ new Set([sg.id]));
    if (memberIds.length === 0) continue;
    out.push({ box: boxes.get(sg.id), members: new Set(memberIds) });
  }
  return out;
}
function contentBounds(boxes, extraPoints = [], padding = 0) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x - b.width / 2);
    minY = Math.min(minY, b.y - b.height / 2);
    maxX = Math.max(maxX, b.x + b.width / 2);
    maxY = Math.max(maxY, b.y + b.height / 2);
  }
  for (const p of extraPoints) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: n(minX - padding),
    y: n(minY - padding),
    width: n(maxX - minX + padding * 2),
    height: n(maxY - minY + padding * 2)
  };
}

// src/layout/measure.ts
var MIN_WIDTH = 56;
var MIN_HEIGHT = 38;
function measureNode(node, theme) {
  const t = theme.tokens;
  const lines = node.label.length ? node.label.split("\n") : [""];
  const charW = t.font.size * 0.62;
  const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
  let width = Math.ceil(maxChars * charW) + t.spacing.nodePadX * 2;
  let height = lines.length * t.font.lineHeight + t.spacing.nodePadY * 2;
  width = Math.max(width, MIN_WIDTH);
  height = Math.max(height, MIN_HEIGHT);
  switch (node.shape) {
    case "circle": {
      const d = Math.round(Math.max(width, height) * 1.15);
      return { width: d, height: d };
    }
    case "diamond":
      return { width: Math.round(width * 1.4), height: Math.round(height * 1.5) };
    case "hexagon":
      return { width: Math.round(width + height * 0.6), height };
    case "parallelogram":
    case "parallelogram-alt":
      return { width: Math.round(width + height * 0.5), height };
    case "cylinder":
      return { width, height: height + 12 };
    case "stadium":
      return { width: Math.round(width + height * 0.4), height };
    default:
      return { width, height };
  }
}

// src/layout/index.ts
function applyBridges(edges, theme, bridges) {
  const enabled = theme.edgeStyle === "elbow" && (bridges ?? true);
  const bridged = applyEdgeBridges(edges, enabled);
  edges.forEach((e, i) => {
    if (bridged[i]) e.path = bridged[i];
  });
}
function finishEdges(edges, theme, bridges, nodeBoxes, subgraphs, pinned) {
  avoidSubgraphs(edges, subgraphs ?? [], theme.edgeStyle);
  if (nodeBoxes) trimEndpointReentry(edges, nodeBoxes, theme.edgeStyle);
  if (nodeBoxes) for (let k = 0; k < NODE_AVOID_PASSES; k++) {
    avoidNodes(edges, nodeBoxes, theme.edgeStyle);
    detourApproaches(edges, nodeBoxes, theme.edgeStyle);
  }
  offsetLabelsOffLine(edges, theme);
  separateLanes(edges, theme.edgeStyle);
  separateAntiParallelJogs(edges, theme.edgeStyle);
  separateConvergentJogs(edges, theme.edgeStyle);
  deCollideLabels(edges, theme);
  deCollideLabelsFromEdges(edges, theme);
  if (nodeBoxes) deCollideLabelsFromNodes(edges, theme, nodeBoxes);
  deCollideLabels(edges, theme);
  applyBridges(edges, theme, bridges);
}
function offsetLabelsOffLine(edges, theme) {
  const plates = edges.map((e) => {
    if (!e.label || !e.labelPos) return void 0;
    const s = labelPlateSize(e.label, theme);
    return { x: round(e.labelPos.x), y: round(e.labelPos.y), w: s.w, h: s.h };
  });
  const shifts = resolveLabelLineOffsets(
    plates,
    edges.map((e) => e.points),
    // A label rides a genuine cubic (labelPoint used its "curved" branch) only when the
    // edge is curved AND has no waypoints; a curved edge WITH waypoints routes as an elbow
    // and centres via labelPoint("elbow"), so its home segment is the interior mid segment
    // (REV-001). Mirrored in the runtime twin's per-edge cubic test.
    edges.map((e) => theme.edgeStyle === "curved" && (e.waypoints?.length ?? 0) === 0)
  );
  edges.forEach((e, i) => {
    const sh = shifts[i];
    if (e.labelPos && (sh.x !== 0 || sh.y !== 0)) {
      e.labelPos = { x: round(e.labelPos.x) + sh.x, y: round(e.labelPos.y) + sh.y };
    }
  });
}
function deCollideLabelsFromEdges(edges, theme) {
  const plates = edges.map((e) => {
    if (!e.label || !e.labelPos) return void 0;
    const s = labelPlateSize(e.label, theme);
    return { x: round(e.labelPos.x), y: round(e.labelPos.y), w: s.w, h: s.h };
  });
  const shifts = resolveLabelEdgeCollisions(plates, edges.map((e) => e.points));
  edges.forEach((e, i) => {
    const sh = shifts[i];
    if (e.labelPos && (sh.x !== 0 || sh.y !== 0)) {
      e.labelPos = { x: round(e.labelPos.x) + sh.x, y: round(e.labelPos.y) + sh.y };
    }
  });
}
function deCollideLabelsFromNodes(edges, theme, nodeBoxes) {
  const plates = edges.map((e) => {
    if (!e.label || !e.labelPos) return void 0;
    const s = labelPlateSize(e.label, theme);
    return { x: round(e.labelPos.x), y: round(e.labelPos.y), w: s.w, h: s.h };
  });
  const shifts = resolveLabelNodeCollisions(plates, nodeBoxes);
  edges.forEach((e, i) => {
    const sh = shifts[i];
    if (e.labelPos && (sh.x !== 0 || sh.y !== 0)) {
      e.labelPos = { x: round(e.labelPos.x) + sh.x, y: round(e.labelPos.y) + sh.y };
    }
  });
}
function deCollideLabels(edges, theme) {
  const plates = edges.map((e) => {
    if (!e.label || !e.labelPos) return void 0;
    const s = labelPlateSize(e.label, theme);
    return { x: round(e.labelPos.x), y: round(e.labelPos.y), w: s.w, h: s.h };
  });
  const shifts = resolveLabelCollisions(plates);
  edges.forEach((e, i) => {
    const sh = shifts[i];
    if (e.labelPos && (sh.x !== 0 || sh.y !== 0)) {
      e.labelPos = { x: round(e.labelPos.x) + sh.x, y: round(e.labelPos.y) + sh.y };
    }
  });
}
var dagre = dagreNs.default ?? dagreNs;
var BOUNDS_PADDING = 20;
function rankdir(direction) {
  return direction;
}
function layout(model, opts = {}) {
  const theme = opts.theme ?? themes.light;
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({
    rankdir: rankdir(model.direction),
    nodesep: opts.nodesep ?? theme.tokens.spacing.nodesep,
    ranksep: opts.ranksep ?? theme.tokens.spacing.ranksep,
    marginx: 8,
    marginy: 8
  });
  g.setDefaultEdgeLabel(() => ({}));
  const sizes = /* @__PURE__ */ new Map();
  for (const node of model.nodes) {
    const s = measureNode(node, theme);
    sizes.set(node.id, s);
    g.setNode(node.id, { width: s.width, height: s.height });
  }
  for (const sg of model.subgraphs) {
    if (!g.hasNode(sg.id)) g.setNode(sg.id, { label: sg.title });
  }
  for (const sg of model.subgraphs) {
    for (const child of sg.children) {
      if (g.hasNode(child)) g.setParent(child, sg.id);
    }
  }
  model.edges.forEach((edge, i) => {
    if (!g.hasNode(edge.from) || !g.hasNode(edge.to)) return;
    const minlen = Math.min(4, Math.max(1, Math.round(edge.length / 2)));
    g.setEdge(edge.from, edge.to, { minlen, weight: 1 }, `e${i}`);
  });
  dagre.layout(g);
  const nodeBoxes = /* @__PURE__ */ new Map();
  const positionedNodes = model.nodes.map((node) => {
    const nd = g.node(node.id);
    const box = {
      x: round(nd.x),
      y: round(nd.y),
      width: nd.width,
      height: nd.height,
      shape: node.shape
    };
    nodeBoxes.set(node.id, box);
    return { ...node, x: box.x, y: box.y, width: box.width, height: box.height };
  });
  const positionedSubgraphs = [];
  for (const sg of model.subgraphs) {
    const sd = g.node(sg.id);
    if (!sd || !Number.isFinite(sd.x) || !Number.isFinite(sd.width)) continue;
    positionedSubgraphs.push({
      ...sg,
      x: round(sd.x),
      y: round(sd.y),
      width: sd.width,
      height: sd.height
    });
  }
  const sgBoxes = computeSubgraphBoxes(positionedSubgraphs, nodeBoxes);
  for (const sg of positionedSubgraphs) {
    const b = sgBoxes.get(sg.id);
    sg.x = b.x;
    sg.y = b.y;
    sg.width = b.width;
    sg.height = b.height;
  }
  const subgraphBoxes = positionedSubgraphs.map((sg) => ({
    x: sg.x,
    y: sg.y,
    width: sg.width,
    height: sg.height
  }));
  const labelSizes = model.edges.map((e) => labelPlateSize(e.label, theme));
  const waypointsList = model.edges.map((edge, i) => edgeWaypoints(g, edge.from, edge.to, `e${i}`));
  const ports = computePerimeterPorts(model.edges, nodeBoxes, labelSizes, void 0, waypointsList);
  const edges = [];
  model.edges.forEach((edge, i) => {
    const from = nodeBoxes.get(edge.from);
    const to = nodeBoxes.get(edge.to);
    if (!from || !to) return;
    const waypoints = waypointsList[i];
    const port = ports[i];
    const routed = routeEdge(from, to, model.direction, theme.edgeStyle, waypoints, port);
    const out = { ...edge, points: routed.points, path: routed.path };
    if (waypoints.length > 0) out.waypoints = waypoints;
    if (port.source.offset !== 0 || port.target.offset !== 0 || port.labelShift) out.ports = port;
    if (edge.label) out.labelPos = routed.labelPos;
    edges.push(out);
  });
  finishEdges(
    edges,
    theme,
    opts.bridges,
    positionedNodes.map(toBox),
    computeAvoidContainers(positionedSubgraphs, nodeBoxes)
  );
  const allEdgePoints = edges.flatMap((e) => e.points);
  const bounds = contentBounds(
    [...subgraphBoxes, ...positionedNodes.map(toBox)],
    [...allEdgePoints, ...labelPlateCorners(edges, theme)],
    // v0.6.4 — include off-line label plates so they're never clipped
    BOUNDS_PADDING
  );
  return {
    direction: model.direction,
    nodes: positionedNodes,
    edges,
    subgraphs: positionedSubgraphs,
    classDefs: model.classDefs,
    bounds
  };
}
function edgeWaypoints(g, from, to, name) {
  if (!g.hasEdge(from, to, name)) return [];
  const raw = g.edge(from, to, name).points;
  if (!raw || raw.length <= 3) return [];
  return raw.slice(1, -1).map((p) => ({ x: round(p.x), y: round(p.y) }));
}
function labelPlateSize(label, theme) {
  if (!label) return void 0;
  const f = theme.tokens.font;
  const lines = label.split("\n");
  const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
  return { w: maxChars * f.size * 0.6 + 6, h: lines.length * f.lineHeight + 2 };
}
function labelPlateCorners(edges, theme) {
  const pts = [];
  for (const e of edges) {
    if (!e.label || !e.labelPos) continue;
    const s = labelPlateSize(e.label, theme);
    pts.push(
      { x: e.labelPos.x - s.w / 2, y: e.labelPos.y - s.h / 2 },
      { x: e.labelPos.x + s.w / 2, y: e.labelPos.y + s.h / 2 }
    );
  }
  return pts;
}
function toBox(node) {
  return { id: node.id, x: node.x, y: node.y, width: node.width, height: node.height };
}
function round(value) {
  return Math.round(value * 100) / 100;
}

// src/model/index.ts
function serializeModel(model) {
  const classDefs = {};
  for (const [name, def] of model.classDefs) classDefs[name] = def;
  return {
    direction: model.direction,
    nodes: model.nodes,
    edges: model.edges,
    subgraphs: model.subgraphs,
    classDefs,
    bounds: model.bounds
  };
}
function isPositionedModel(value) {
  return "bounds" in value && value.bounds !== void 0;
}

// src/mermaid/router.ts
var FLOWCHART_TYPES = /* @__PURE__ */ new Set(["flowchart", "flowchart-v2", "graph"]);
var SEQUENCE_TYPE = "sequence";
var CLASS_TYPE = "class";
var STATE_TYPES = /* @__PURE__ */ new Set(["stateDiagram", "state"]);
var NATIVE_PLANNED = /* @__PURE__ */ new Set([]);
var mermaidPromise;
function inNodeRuntime() {
  return typeof process !== "undefined" && !!process.versions?.node;
}
function needsHeadlessDom() {
  return typeof document === "undefined" || typeof globalThis.document?.createElementNS !== "function";
}
var headlessDomInstalled = false;
function usedHeadlessDom() {
  return headlessDomInstalled;
}
async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = (async () => {
      if (inNodeRuntime() && needsHeadlessDom()) {
        await (await Promise.resolve().then(() => (init_jsdom_env(), jsdom_env_exports))).ensureNodeDom();
        headlessDomInstalled = true;
      }
      const mod = await import('mermaid');
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        deterministicIds: true
      });
      return mermaid;
    })();
  }
  return mermaidPromise;
}
function leadingKeyword(dsl) {
  for (const raw of dsl.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("%%")) continue;
    if (line === "---") return null;
    const m = /^([A-Za-z][A-Za-z0-9-]*)/.exec(line);
    return m ? m[1].toLowerCase() : null;
  }
  return null;
}
function nativeFlowchart(detected) {
  return {
    detected,
    type: "flowchart",
    tier: "native",
    renderer: "flowchart",
    nativePlanned: false
  };
}
async function classify(dsl) {
  const head = leadingKeyword(dsl);
  if (head === "flowchart" || head === "graph") return nativeFlowchart(head);
  let detected;
  try {
    const mermaid = await loadMermaid();
    detected = mermaid.detectType(dsl);
  } catch {
    return nativeFlowchart(null);
  }
  if (FLOWCHART_TYPES.has(detected)) return nativeFlowchart(detected);
  if (detected === SEQUENCE_TYPE) {
    return { detected, type: "sequence", tier: "native", renderer: "sequence", nativePlanned: false };
  }
  if (detected === CLASS_TYPE) {
    return { detected, type: "class", tier: "native", renderer: "class", nativePlanned: false };
  }
  if (STATE_TYPES.has(detected)) {
    return { detected, type: "state", tier: "native", renderer: "state", nativePlanned: false };
  }
  return {
    detected,
    type: detected,
    tier: "fallback",
    renderer: "mermaid",
    nativePlanned: NATIVE_PLANNED.has(detected)
  };
}

// src/render/prepare.ts
function prepare(input, opts = {}) {
  const theme = resolveTheme(opts.theme);
  if (typeof input === "string") {
    return { model: layout(parse(input, { strict: opts.strict }), { theme, bridges: opts.bridges }), theme };
  }
  if (isPositionedModel(input)) {
    return { model: input, theme };
  }
  return { model: layout(input, { theme, bridges: opts.bridges }), theme };
}

// src/render/dom/runtime.ts
function vnmRuntime(root, payload) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const SVGNS = "http://www.w3.org/2000/svg";
  const model = payload.model;
  const opt = payload.options;
  let tokens = payload.theme.tokens;
  let edgeStyle = payload.theme.edgeStyle;
  const sketch = opt.style === "sketch";
  const arrowCaps = opt.arrowCaps !== false;
  const semEdges = tokens.effects.semanticEdges === true;
  const SEMANTICS_T = ["request", "response", "cache", "async", "exception"];
  const SEMANTIC_LABEL_T = { request: "request", response: "response", cache: "cache", async: "async", exception: "exception" };
  const flowSemT = (kind, label) => {
    const s = (label || "").toLowerCase();
    if (/error|fail|reject|denied|invalid|exception|timeout|unauthor|refus|\b40[13]\b|\b500\b/.test(s)) return "exception";
    if (/cache|redis|\bhit\b|\bmiss\b|memcache|\bttl\b|lookup/.test(s)) return "cache";
    if (/emit|publish|event|async|enqueue|\bqueue\b|kafka|\btopic\b|stream|notify|webhook|fire|dispatch/.test(s)) return "async";
    if (/\bget\b|\bpost\b|\bput\b|verify|login|auth|query|fetch|read|write|route|call|request|checkout|sync/.test(s)) return "request";
    if (kind === "dotted") return "cache";
    return void 0;
  };
  const semColorT = (sem) => {
    const r = tokens.colors.roles;
    if (sem === "request") return r.backend?.stroke ?? tokens.colors.accent;
    if (sem === "cache") return r.database?.stroke ?? tokens.colors.accent;
    if (sem === "async") return r.messagebus?.stroke ?? tokens.colors.accent;
    if (sem === "exception") return r.danger?.stroke ?? "#ef4444";
    return tokens.colors.edge;
  };
  const semMarkerT = (sem) => "vnm-arrow-" + (sem || "response");
  const edgeColorT = (kind, label) => {
    const sem = semEdges ? flowSemT(kind, label || "") : void 0;
    return sem ? { color: semColorT(sem), marker: semMarkerT(sem) } : { color: tokens.colors.edge, marker: "vnm-arrow" };
  };
  const SK_ROUGHNESS = 2.4;
  const SK_BOWING = 2.2;
  const SK_OUTLINE_STROKES = 2;
  const SK_ELLIPSE_STEPS = 22;
  const SK_FILL_ROUGHNESS = 1.2;
  const offsetX = model.bounds.x;
  const offsetY = model.bounds.y;
  const contentW = model.bounds.width;
  const contentH = model.bounds.height;
  const positions = {};
  const sizes = {};
  const baseSizes = {};
  const shapeById = {};
  for (const nd of model.nodes) {
    positions[nd.id] = { x: nd.x - offsetX, y: nd.y - offsetY };
    sizes[nd.id] = { w: nd.width, h: nd.height };
    baseSizes[nd.id] = { w: nd.width, h: nd.height };
    shapeById[nd.id] = nd.shape;
  }
  const anchorsOv = {};
  let tx = 0;
  let ty = 0;
  let scale = 1;
  root.classList.add("vnm-root");
  const viewport = doc.createElement("div");
  viewport.className = "vnm-viewport";
  viewport.setAttribute(
    "style",
    "position:absolute;inset:0;overflow:hidden;background:var(--vnm-bg);cursor:grab;touch-action:none;user-select:none;font-family:var(--vnm-font);" + payload.cssVars
  );
  if (getComputedStyle(root).position === "static") root.style.position = "relative";
  root.appendChild(viewport);
  if (sketch && payload.sketch) {
    const fontStyle = doc.createElement("style");
    fontStyle.textContent = payload.sketch.fontFace;
    viewport.appendChild(fontStyle);
  }
  const world = doc.createElement("div");
  world.className = "vnm-world";
  world.setAttribute("style", "position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;");
  viewport.appendChild(world);
  const svg = doc.createElementNS(SVGNS, "svg");
  svg.setAttribute("class", "vnm-edges");
  svg.setAttribute("width", String(contentW));
  svg.setAttribute("height", String(contentH));
  svg.setAttribute("style", "position:absolute;left:0;top:0;overflow:visible;pointer-events:none;");
  const defs2 = doc.createElementNS(SVGNS, "defs");
  defs2.innerHTML = '<marker id="vnm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="' + tokens.edge.arrowSize + '" markerHeight="' + tokens.edge.arrowSize + '" orient="auto"><path d="M0 0 L10 5 L0 10 z"></path></marker><marker id="vnm-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="' + tokens.edge.arrowSize + '" markerHeight="' + tokens.edge.arrowSize + '" orient="auto"><path d="M10 0 L0 5 L10 10 z"></path></marker>' + // Archify: coloured arrowhead markers per semantic (gated on the theme flag), so a
  // colored live edge's head takes its own colour. Mirrors svgDefs()/static defs().
  (semEdges ? SEMANTICS_T.map(
    (s) => '<marker id="' + semMarkerT(s) + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="' + tokens.edge.arrowSize + '" markerHeight="' + tokens.edge.arrowSize + '" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="' + semColorT(s) + '"></path></marker>'
  ).join("") : "");
  svg.appendChild(defs2);
  const gBoxes = doc.createElementNS(SVGNS, "g");
  const gEdges = doc.createElementNS(SVGNS, "g");
  const gLabels = doc.createElementNS(SVGNS, "g");
  const gTitles = doc.createElementNS(SVGNS, "g");
  const gNodes = doc.createElementNS(SVGNS, "g");
  gBoxes.setAttribute("class", "vnm-subgraph-layer");
  gEdges.setAttribute("class", "vnm-edge-layer");
  gLabels.setAttribute("class", "vnm-label-layer");
  gTitles.setAttribute("class", "vnm-title-layer");
  gNodes.setAttribute("class", "vnm-node-layer");
  svg.appendChild(gBoxes);
  svg.appendChild(gEdges);
  svg.appendChild(gLabels);
  svg.appendChild(gTitles);
  svg.appendChild(gNodes);
  world.appendChild(svg);
  const SG_PAD = 14;
  const SG_TITLE = 22;
  const subgraphMembers = {};
  {
    const childrenById = {};
    for (const sg of model.subgraphs) childrenById[sg.id] = sg.children;
    const isNode = (id) => !!positions[id];
    const resolve = (id, seen) => {
      const out = [];
      for (const child of childrenById[id] || []) {
        if (isNode(child)) out.push(child);
        else if (childrenById[child] && !seen[child]) {
          seen[child] = true;
          out.push(...resolve(child, seen));
        }
      }
      return out;
    };
    for (const sg of model.subgraphs) subgraphMembers[sg.id] = resolve(sg.id, { [sg.id]: true });
  }
  function sgBoxFrom(boxes, hasTitle) {
    if (!boxes.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.x - b.w / 2);
      minY = Math.min(minY, b.y - b.h / 2);
      maxX = Math.max(maxX, b.x + b.w / 2);
      maxY = Math.max(maxY, b.y + b.h / 2);
    }
    const top = SG_PAD + (hasTitle ? SG_TITLE : 0);
    const x0 = minX - SG_PAD;
    const y0 = minY - top;
    const x1 = maxX + SG_PAD;
    const y1 = maxY + SG_PAD;
    return { x: nAt((x0 + x1) / 2), y: nAt((y0 + y1) / 2), w: nAt(x1 - x0), h: nAt(y1 - y0) };
  }
  function subgraphWorldBox(sg) {
    const ids = subgraphMembers[sg.id] || [];
    const boxes = ids.map((id) => ({ x: positions[id].x, y: positions[id].y, w: sizes[id].w, h: sizes[id].h }));
    return sgBoxFrom(boxes, !!sg.title) ?? { x: sg.x - offsetX, y: sg.y - offsetY, w: sg.width, h: sg.height };
  }
  const subgraphEls = [];
  for (const sg of model.subgraphs) {
    const r = doc.createElementNS(SVGNS, "rect");
    r.setAttribute("class", "vnm-subgraph");
    r.setAttribute("rx", String(tokens.radii.card));
    r.setAttribute("fill", "var(--vnm-subgraph-fill)");
    r.setAttribute("stroke", "var(--vnm-subgraph-stroke)");
    r.setAttribute("stroke-dasharray", "4 4");
    gBoxes.appendChild(r);
    const rec = { sg, rect: r };
    if (sg.title) {
      const plate = doc.createElementNS(SVGNS, "rect");
      plate.setAttribute("class", "vnm-subgraph-title-plate");
      plate.setAttribute("fill", "var(--vnm-subgraph-fill)");
      plate.setAttribute("rx", String(tokens.radii.label));
      gTitles.appendChild(plate);
      const tnode = doc.createElementNS(SVGNS, "text");
      tnode.setAttribute("class", "vnm-subgraph-title");
      tnode.setAttribute("fill", "var(--vnm-subgraph-text)");
      tnode.setAttribute("font-size", String(tokens.font.size - 1));
      tnode.setAttribute("font-weight", "600");
      tnode.textContent = sg.title;
      gTitles.appendChild(tnode);
      rec.plate = plate;
      rec.text = tnode;
    }
    subgraphEls.push(rec);
  }
  function renderSubgraphs() {
    for (const rec of subgraphEls) {
      const b = subgraphWorldBox(rec.sg);
      rec.rect.setAttribute("x", String(b.x - b.w / 2));
      rec.rect.setAttribute("y", String(b.y - b.h / 2));
      rec.rect.setAttribute("width", String(b.w));
      rec.rect.setAttribute("height", String(b.h));
      if (rec.text) {
        const tx2 = b.x - b.w / 2 + 12;
        const ty2 = b.y - b.h / 2 + 18;
        rec.text.setAttribute("x", String(tx2));
        rec.text.setAttribute("y", String(ty2));
        if (rec.plate) {
          const fs = tokens.font.size - 1;
          const pad = 5;
          const pw = rec.sg.title.length * fs * 0.6 + pad * 2;
          rec.plate.setAttribute("x", String(nAt(tx2 - pad)));
          rec.plate.setAttribute("y", String(nAt(ty2 - fs + 1)));
          rec.plate.setAttribute("width", String(nAt(pw)));
          rec.plate.setAttribute("height", String(fs + 4));
        }
      }
    }
  }
  const edgeEls = [];
  for (const e of model.edges) {
    const path = doc.createElementNS(SVGNS, "path");
    path.setAttribute("fill", "none");
    const ec = edgeColorT(e.kind, e.label ?? "");
    path.setAttribute("stroke", semEdges && ec.marker !== "vnm-arrow" ? ec.color : "var(--vnm-edge)");
    path.setAttribute("stroke-width", String(e.kind === "thick" ? tokens.edge.thickWidth : tokens.edge.width));
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    if (e.kind === "dotted") path.setAttribute("stroke-dasharray", "2 5");
    if (!sketch && e.arrows.end) path.setAttribute("marker-end", "url(#" + ec.marker + ")");
    if (!sketch && e.arrows.start) path.setAttribute("marker-start", "url(#vnm-arrow-start)");
    gEdges.appendChild(path);
    const rec = { from: e.from, to: e.to, kind: e.kind, arrows: e.arrows, path };
    if (sketch && (e.arrows.end || e.arrows.start)) {
      const head = doc.createElementNS(SVGNS, "path");
      head.setAttribute("fill", "none");
      head.setAttribute("stroke", semEdges && ec.marker !== "vnm-arrow" ? ec.color : "var(--vnm-edge)");
      head.setAttribute("stroke-width", String(e.kind === "thick" ? tokens.edge.thickWidth : tokens.edge.width));
      head.setAttribute("stroke-linejoin", "round");
      head.setAttribute("stroke-linecap", "round");
      gEdges.appendChild(head);
      rec.headPath = head;
    }
    if (e.waypoints && e.waypoints.length) {
      rec.waypoints = e.waypoints.map((p) => ({ x: p.x - offsetX, y: p.y - offsetY }));
    }
    if (e.label) {
      rec.label = e.label;
      const plate = doc.createElementNS(SVGNS, "rect");
      plate.setAttribute("fill", "var(--vnm-edge-label-bg)");
      plate.setAttribute("rx", String(tokens.radii.label));
      gLabels.appendChild(plate);
      const text = doc.createElementNS(SVGNS, "text");
      text.setAttribute("fill", "var(--vnm-edge-label-text)");
      text.setAttribute("font-size", String(tokens.font.size - 1));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.textContent = e.label;
      gLabels.appendChild(text);
      rec.plate = plate;
      rec.text = text;
    }
    edgeEls.push(rec);
  }
  defs2.querySelector("marker path")?.setAttribute("fill", tokens.colors.edge);
  const classDefs = model.classDefs;
  const cards = {};
  for (const nd of model.nodes) {
    const card = doc.createElement("div");
    card.className = "vnm-node";
    card.dataset.id = nd.id;
    card.dataset.shape = nd.shape;
    const st = styleForNode(nd.id, nd.classes, nd.style);
    card.setAttribute("style", cardStyle(nd.id, st));
    const inner = doc.createElement("div");
    inner.setAttribute("style", "white-space:pre-line;text-align:center;pointer-events:none;");
    inner.textContent = nd.label;
    card.appendChild(inner);
    world.appendChild(card);
    cards[nd.id] = card;
  }
  const capOverlay = arrowCaps ? doc.createElementNS(SVGNS, "svg") : null;
  if (capOverlay) {
    capOverlay.setAttribute("class", "vnm-arrow-caps");
    capOverlay.setAttribute("width", String(contentW));
    capOverlay.setAttribute("height", String(contentH));
    capOverlay.setAttribute("style", "position:absolute;left:0;top:0;overflow:visible;pointer-events:none;");
    world.appendChild(capOverlay);
  }
  const nodeShapeEls = {};
  const stateMarkerEls = {};
  if (sketch) {
    for (const nd of model.nodes) {
      if (nd.stateMarker) {
        const circles = [];
        const mk = () => {
          const c = doc.createElementNS(SVGNS, "circle");
          gNodes.appendChild(c);
          circles.push(c);
          return c;
        };
        if (nd.stateMarker === "start") {
          mk().setAttribute("fill", tokens.colors.text);
        } else {
          const ring = mk();
          ring.setAttribute("fill", "none");
          ring.setAttribute("stroke", tokens.colors.text);
          ring.setAttribute("stroke-width", "1.5");
          mk().setAttribute("fill", tokens.colors.text);
        }
        stateMarkerEls[nd.id] = circles;
        continue;
      }
      const st = styleForNode(nd.id, nd.classes, nd.style);
      const sw = st.strokeWidth ?? "1.5";
      const fillEl = doc.createElementNS(SVGNS, "path");
      fillEl.setAttribute("fill", st.fill);
      fillEl.setAttribute("stroke", "none");
      gNodes.appendChild(fillEl);
      const probe = sketchShapePoints(nd.shape, 0, 0, 100, 100);
      const strokeCount = SK_OUTLINE_STROKES + probe.extras.length * SK_OUTLINE_STROKES;
      const strokes = [];
      for (let i = 0; i < strokeCount; i++) {
        const p = doc.createElementNS(SVGNS, "path");
        p.setAttribute("fill", "none");
        p.setAttribute("stroke", st.stroke);
        p.setAttribute("stroke-width", sw);
        p.setAttribute("stroke-linejoin", "round");
        p.setAttribute("stroke-linecap", "round");
        if (st.strokeDasharray) p.setAttribute("stroke-dasharray", st.strokeDasharray);
        gNodes.appendChild(p);
        strokes.push(p);
      }
      nodeShapeEls[nd.id] = { fill: fillEl, strokes };
    }
  }
  function renderNodeShape(id) {
    const markers = stateMarkerEls[id];
    if (markers) {
      const mp = positions[id];
      const ms = sizes[id];
      const r = Math.min(9, ms.w / 2);
      for (const c of markers) {
        c.setAttribute("cx", String(nAt(mp.x)));
        c.setAttribute("cy", String(nAt(mp.y)));
      }
      markers[0].setAttribute("r", String(nAt(r)));
      if (markers[1]) markers[1].setAttribute("r", String(nAt(r - 4)));
      return;
    }
    const els = nodeShapeEls[id];
    if (!els) return;
    const p = positions[id];
    const s = sizes[id];
    const { pts, extras } = sketchShapePoints(shapeById[id], p.x - s.w / 2, p.y - s.h / 2, s.w, s.h);
    const rs = roughShape2(pts, id);
    els.fill.setAttribute("d", rs.fill);
    const ds = rs.outline.slice();
    extras.forEach((seg, i) => {
      for (const d of roughPolyline2(seg, id + "#x" + i)) ds.push(d);
    });
    els.strokes.forEach((el, i) => el.setAttribute("d", ds[i] ?? ""));
  }
  const HANDLE = 10;
  const MIN_SIZE = 24;
  const handleEls = [];
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ]) {
    const h = doc.createElement("div");
    h.className = "vnm-resize-handle";
    h.dataset.sx = String(sx);
    h.dataset.sy = String(sy);
    h.setAttribute(
      "style",
      "position:absolute;width:" + HANDLE + "px;height:" + HANDLE + "px;box-sizing:border-box;background:var(--vnm-surface);border:1.5px solid var(--vnm-accent);border-radius:2px;display:none;touch-action:none;z-index:6;cursor:" + (sx * sy > 0 ? "nwse-resize" : "nesw-resize") + ";"
    );
    world.appendChild(h);
    handleEls.push(h);
  }
  function hideHandles() {
    for (const h of handleEls) h.style.display = "none";
  }
  function positionHandles() {
    if (!selected || !cards[selected]) {
      hideHandles();
      return;
    }
    const p = positions[selected];
    const s = sizes[selected];
    for (const h of handleEls) {
      const sx = Number(h.dataset.sx);
      const sy = Number(h.dataset.sy);
      h.style.left = p.x + sx * s.w / 2 - HANDLE / 2 + "px";
      h.style.top = p.y + sy * s.h / 2 - HANDLE / 2 + "px";
      h.style.display = "block";
    }
  }
  function applyCardSize(id) {
    const s = sizes[id];
    cards[id].style.width = s.w + "px";
    cards[id].style.height = s.h + "px";
  }
  const EP = 9;
  const edgeHandles = [];
  edgeEls.forEach((_e, i) => {
    for (const end of ["source", "target"]) {
      const h = doc.createElement("div");
      h.className = "vnm-edge-handle";
      h.dataset.ei = String(i);
      h.dataset.end = end;
      h.setAttribute(
        "style",
        "position:absolute;width:" + EP + "px;height:" + EP + "px;box-sizing:border-box;background:var(--vnm-accent);border:1.5px solid var(--vnm-surface);border-radius:50%;display:none;touch-action:none;z-index:7;cursor:grab;"
      );
      world.appendChild(h);
      edgeHandles.push({ el: h, ei: i, end });
    }
  });
  function positionEdgeHandles(ports) {
    for (const eh of edgeHandles) {
      const e = edgeEls[eh.ei];
      const nodeId = eh.end === "source" ? e.from : e.to;
      const isSelf = e.from === e.to;
      if (nodeId !== selected || isSelf) {
        eh.el.style.display = "none";
        continue;
      }
      const p = positions[nodeId];
      const s = sizes[nodeId];
      const a = ports[eh.ei][eh.end];
      const pt = anchor({ x: p.x, y: p.y, w: s.w, h: s.h, shape: shapeById[nodeId] }, a.side, a.offset);
      eh.el.style.left = pt.x - EP / 2 + "px";
      eh.el.style.top = pt.y - EP / 2 + "px";
      eh.el.style.display = "block";
    }
  }
  function anchorFromPointer(box, wx, wy) {
    const dx = wx - box.x;
    const dy = wy - box.y;
    const nx = box.w ? dx / (box.w / 2) : 0;
    const ny = box.h ? dy / (box.h / 2) : 0;
    if (Math.abs(nx) >= Math.abs(ny)) {
      return { side: dx >= 0 ? "right" : "left", offset: clampOff(dy, box.h / 2) };
    }
    return { side: dy >= 0 ? "bottom" : "top", offset: clampOff(dx, box.w / 2) };
  }
  let minimap = null;
  if (opt.minimap) {
    minimap = doc.createElement("canvas");
    minimap.className = "vnm-minimap";
    minimap.width = 180;
    minimap.height = Math.max(80, Math.round(180 * contentH / Math.max(contentW, 1)));
    minimap.setAttribute(
      "style",
      "position:absolute;right:12px;bottom:12px;border:1px solid var(--vnm-surface-stroke);border-radius:8px;background:var(--vnm-minimap-bg);cursor:pointer;box-shadow:var(--vnm-node-shadow);"
    );
    viewport.appendChild(minimap);
  }
  const toolbar = doc.createElement("div");
  toolbar.className = "vnm-toolbar";
  toolbar.setAttribute(
    "style",
    "position:absolute;left:12px;top:12px;display:flex;gap:6px;"
  );
  const mkBtn = (label, title, on) => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute(
      "style",
      "width:28px;height:28px;border:1px solid var(--vnm-surface-stroke);border-radius:6px;background:var(--vnm-surface);color:var(--vnm-text);cursor:pointer;font-size:15px;line-height:1;"
    );
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      on();
    });
    toolbar.appendChild(btn);
    return btn;
  };
  mkBtn("\u2922", "Fit to view", () => fit());
  mkBtn("+", "Zoom in", () => zoomBy(1.2));
  mkBtn("\u2212", "Zoom out", () => zoomBy(1 / 1.2));
  mkBtn("\u27F2", "Reset layout", () => resetLayout());
  const mkTextBtn = (label, title, on) => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.title = title;
    btn.className = "vnm-export-btn";
    btn.setAttribute(
      "style",
      "height:28px;padding:0 9px;border:1px solid var(--vnm-surface-stroke);border-radius:6px;background:var(--vnm-surface);color:var(--vnm-text);cursor:pointer;font-size:12px;font-weight:600;line-height:1;"
    );
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      on();
    });
    toolbar.appendChild(btn);
    return btn;
  };
  mkTextBtn("SVG", "Save as SVG", () => saveSvg());
  mkTextBtn("PNG", "Save as PNG", () => savePng());
  viewport.appendChild(toolbar);
  function nAt(v) {
    return Math.round(v * 100) / 100;
  }
  function roughSeed2(key) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry322(seed) {
    let a = seed >>> 0;
    return function() {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function roughStroke(pts, closed, rand, rough, bow) {
    if (pts.length === 0) return "";
    const jv = pts.map((p) => [p[0] + (rand() * 2 - 1) * rough, p[1] + (rand() * 2 - 1) * rough]);
    const seq = closed ? [...jv, jv[0]] : jv;
    let d = "M " + nAt(seq[0][0]) + " " + nAt(seq[0][1]);
    for (let i = 1; i < seq.length; i++) {
      const ax = seq[i - 1][0];
      const ay = seq[i - 1][1];
      const bx = seq[i][0];
      const by = seq[i][1];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const px = -(by - ay) / len;
      const py = (bx - ax) / len;
      const k = (rand() * 2 - 1) * bow;
      const cx = (ax + bx) / 2 + px * k;
      const cy = (ay + by) / 2 + py * k;
      d += " Q " + nAt(cx) + " " + nAt(cy) + " " + nAt(bx) + " " + nAt(by);
    }
    if (closed) d += " Z";
    return d;
  }
  function roughShape2(pts, key) {
    const fill = roughStroke(pts, true, mulberry322(roughSeed2(key + "#f")), SK_FILL_ROUGHNESS, SK_BOWING);
    const outline = [];
    for (let s = 0; s < SK_OUTLINE_STROKES; s++) {
      outline.push(roughStroke(pts, true, mulberry322(roughSeed2(key + "#o" + s)), SK_ROUGHNESS, SK_BOWING));
    }
    return { fill, outline };
  }
  function sketchEllipsePoints(cx, cy, rx, ry) {
    const pts = [];
    for (let i = 0; i < SK_ELLIPSE_STEPS; i++) {
      const a = i / SK_ELLIPSE_STEPS * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return pts;
  }
  function roughPolyline2(pts, key) {
    const out = [];
    for (let s = 0; s < SK_OUTLINE_STROKES; s++) {
      out.push(roughStroke(pts, false, mulberry322(roughSeed2(key + "#e" + s)), SK_ROUGHNESS * 0.8, SK_BOWING * 0.8));
    }
    return out;
  }
  function openArrowhead2(tip, from, size, key) {
    const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    const r = mulberry322(roughSeed2(key + "#a"));
    const spread = 0.52;
    const len = size * 2.1;
    const a1 = ang + Math.PI - spread + (r() * 2 - 1) * 0.12;
    const a2 = ang + Math.PI + spread + (r() * 2 - 1) * 0.12;
    const l1 = len * (1 + (r() * 2 - 1) * 0.14);
    const l2 = len * (1 + (r() * 2 - 1) * 0.14);
    const b1x = tip[0] + Math.cos(a1) * l1;
    const b1y = tip[1] + Math.sin(a1) * l1;
    const b2x = tip[0] + Math.cos(a2) * l2;
    const b2y = tip[1] + Math.sin(a2) * l2;
    return "M " + nAt(b1x) + " " + nAt(b1y) + " L " + nAt(tip[0]) + " " + nAt(tip[1]) + " L " + nAt(b2x) + " " + nAt(b2y);
  }
  function sketchShapePoints(shape, x, y, w, h) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (shape === "circle") return { pts: sketchEllipsePoints(cx, cy, w / 2, h / 2), extras: [] };
    if (shape === "diamond") return { pts: [[cx, y], [x + w, cy], [cx, y + h], [x, cy]], extras: [] };
    if (shape === "hexagon") {
      const k = Math.min(w * 0.22, h * 0.5);
      return { pts: [[x + k, y], [x + w - k, y], [x + w, cy], [x + w - k, y + h], [x + k, y + h], [x, cy]], extras: [] };
    }
    if (shape === "parallelogram") {
      const k = Math.min(w * 0.22, h);
      return { pts: [[x + k, y], [x + w, y], [x + w - k, y + h], [x, y + h]], extras: [] };
    }
    if (shape === "parallelogram-alt") {
      const k = Math.min(w * 0.22, h);
      return { pts: [[x, y], [x + w - k, y], [x + w, y + h], [x + k, y + h]], extras: [] };
    }
    if (shape === "subroutine") {
      const inset = 6;
      return {
        pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
        extras: [[[x + inset, y], [x + inset, y + h]], [[x + w - inset, y], [x + w - inset, y + h]]]
      };
    }
    return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], extras: [] };
  }
  function sketchEdgeParts(pts, key, arrows, size) {
    const arr = pts.map((p) => [p.x, p.y]);
    const line = roughPolyline2(arr, key).join(" ");
    const m = arr.length;
    let head = "";
    if (arrows.end && m >= 2) head += openArrowhead2(arr[m - 1], arr[m - 2], size, key + "@end");
    if (arrows.start && m >= 2) head += (head ? " " : "") + openArrowhead2(arr[0], arr[1], size, key + "@start");
    return { line, head };
  }
  function simplify2(points) {
    const out = [];
    for (const p of points) {
      const last = out[out.length - 1];
      if (last && nAt(last.x) === nAt(p.x) && nAt(last.y) === nAt(p.y)) continue;
      out.push(p);
    }
    for (let i = out.length - 2; i >= 1; i--) {
      const a = out[i - 1];
      const b = out[i];
      const c = out[i + 1];
      const collinear = nAt(a.x) === nAt(b.x) && nAt(b.x) === nAt(c.x) || nAt(a.y) === nAt(b.y) && nAt(b.y) === nAt(c.y);
      if (collinear) out.splice(i, 1);
    }
    return out;
  }
  function raySide2(b, dx, dy) {
    const sx = dx !== 0 ? b.w / 2 / Math.abs(dx) : Infinity;
    const sy = dy !== 0 ? b.h / 2 / Math.abs(dy) : Infinity;
    if (sx < sy) return dx > 0 ? "right" : "left";
    return dy > 0 ? "bottom" : "top";
  }
  function clampOff(off, half) {
    const max = Math.max(0, half - 6);
    return Math.max(-max, Math.min(max, off));
  }
  function anchorBound2(shape, horiz, hw, hh) {
    const half = horiz ? hw : hh;
    const cap = half - 6;
    if (shape === "rounded") return Math.min(cap, half - 14);
    if (shape === "stadium") return Math.min(cap, half - hh);
    if (shape === "hexagon") return horiz ? Math.min(cap, half - Math.min(hw * 0.44, hh)) : cap;
    if (shape === "parallelogram" || shape === "parallelogram-alt")
      return horiz ? Math.min(cap, half - Math.min(hw * 0.44, 2 * hh)) : cap;
    if (shape === "cylinder") return horiz ? cap : Math.min(cap, half - Math.min(10, hh * 0.36));
    return cap;
  }
  function anchor(b, side, off = 0) {
    const hw = b.w / 2;
    const hh = b.h / 2;
    const cx = b.x;
    const cy = b.y;
    const shape = b.shape || "rect";
    const horiz = side === "top" || side === "bottom";
    const bound = Math.max(0, anchorBound2(shape, horiz, hw, hh));
    const t = Math.max(-bound, Math.min(bound, off));
    if (horiz) {
      const sgn2 = side === "top" ? -1 : 1;
      let y = cy + sgn2 * hh;
      if (shape === "diamond") y = cy + sgn2 * hh * (1 - Math.abs(t) / hw);
      else if (shape === "circle") y = cy + sgn2 * hh * Math.sqrt(1 - t / hw * (t / hw));
      else if (shape === "cylinder") {
        const ry = Math.min(10, hh * 0.36);
        y = cy + sgn2 * (hh - ry + ry * Math.sqrt(1 - t / hw * (t / hw)));
      }
      return { x: cx + t, y };
    }
    const sgn = side === "left" ? -1 : 1;
    let x = cx + sgn * hw;
    if (shape === "diamond") x = cx + sgn * hw * (1 - Math.abs(t) / hh);
    else if (shape === "circle") x = cx + sgn * hw * Math.sqrt(1 - t / hh * (t / hh));
    else if (shape === "hexagon") {
      const k = Math.min(hw * 0.44, hh);
      x = cx + sgn * (hw - k * Math.abs(t) / hh);
    } else if (shape === "parallelogram") {
      const k = Math.min(hw * 0.44, 2 * hh);
      x = side === "left" ? cx - hw + k * (hh - t) / (2 * hh) : cx + hw - k * (t + hh) / (2 * hh);
    } else if (shape === "parallelogram-alt") {
      const k = Math.min(hw * 0.44, 2 * hh);
      x = side === "left" ? cx - hw + k * (t + hh) / (2 * hh) : cx + hw - k * (hh - t) / (2 * hh);
    }
    return { x, y: cy + t };
  }
  function offAlong(p, side, k) {
    if (side === "top") return { x: p.x, y: p.y - k };
    if (side === "bottom") return { x: p.x, y: p.y + k };
    if (side === "left") return { x: p.x - k, y: p.y };
    return { x: p.x + k, y: p.y };
  }
  function snapWaypoints2(interior, start, end) {
    const xs = [start.x, end.x];
    const ys = [start.y, end.y];
    return interior.map((p) => {
      let x = p.x;
      let y = p.y;
      for (const ax of xs) {
        if (Math.abs(x - ax) <= 2) {
          x = ax;
          break;
        }
      }
      for (const ay of ys) {
        if (Math.abs(y - ay) <= 2) {
          y = ay;
          break;
        }
      }
      return { x, y };
    });
  }
  function elbowThrough2(start, end, interior, exitVertical, entryVertical, primaryVertical) {
    const guide = [start, ...snapWaypoints2(interior, start, end), end];
    const out = [guide[0]];
    for (let i = 1; i < guide.length; i++) {
      const prev = out[out.length - 1];
      const cur = guide[i];
      if (nAt(prev.x) !== nAt(cur.x) && nAt(prev.y) !== nAt(cur.y)) {
        let verticalFirst;
        if (i === 1) verticalFirst = exitVertical;
        else if (i === guide.length - 1) verticalFirst = !entryVertical;
        else verticalFirst = primaryVertical;
        out.push(verticalFirst ? { x: prev.x, y: cur.y } : { x: cur.x, y: prev.y });
      }
      out.push(cur);
    }
    perpendicularizeEntry2(out, entryVertical);
    return simplify2(out);
  }
  function perpendicularizeEntry2(out, entryVertical) {
    if (out.length < 3) return;
    const end = out[out.length - 1];
    const a = out[out.length - 3];
    const b = out[out.length - 2];
    const finalPerp = entryVertical ? nAt(b.x) === nAt(end.x) : nAt(b.y) === nAt(end.y);
    const swappable = entryVertical ? nAt(a.y) !== nAt(end.y) : nAt(a.x) !== nAt(end.x);
    if (!finalPerp && swappable) {
      out[out.length - 2] = entryVertical ? { x: end.x, y: a.y } : { x: a.x, y: end.y };
    }
  }
  function dist2(a, b) {
    return Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
  }
  function along2(from, toward, r) {
    const d = dist2(from, toward) || 1;
    return { x: from.x + (toward.x - from.x) * r / d, y: from.y + (toward.y - from.y) * r / d };
  }
  function pathRounded(points) {
    if (points.length <= 2) return pathPoly(points);
    let d = "M " + nAt(points[0].x) + " " + nAt(points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const next = points[i + 1];
      const r = Math.min(12, dist2(prev, cur) / 2, dist2(cur, next) / 2);
      const a = along2(cur, prev, r);
      const b = along2(cur, next, r);
      d += " L " + nAt(a.x) + " " + nAt(a.y) + " Q " + nAt(cur.x) + " " + nAt(cur.y) + " " + nAt(b.x) + " " + nAt(b.y);
    }
    const last = points[points.length - 1];
    d += " L " + nAt(last.x) + " " + nAt(last.y);
    return d;
  }
  function pathPoly(points) {
    if (points.length === 0) return "";
    let d = "M " + nAt(points[0].x) + " " + nAt(points[0].y);
    for (let i = 1; i < points.length; i++) d += " L " + nAt(points[i].x) + " " + nAt(points[i].y);
    return d;
  }
  function pathBezier(p) {
    return "M " + nAt(p[0].x) + " " + nAt(p[0].y) + " C " + nAt(p[1].x) + " " + nAt(p[1].y) + " " + nAt(p[2].x) + " " + nAt(p[2].y) + " " + nAt(p[3].x) + " " + nAt(p[3].y);
  }
  function labelPoly(points) {
    if (points.length === 2) return { x: nAt((points[0].x + points[1].x) / 2), y: nAt((points[0].y + points[1].y) / 2) };
    const mid = Math.floor(points.length / 2);
    return { x: nAt((points[mid - 1].x + points[mid].x) / 2), y: nAt((points[mid - 1].y + points[mid].y) / 2) };
  }
  function labelBezier(p) {
    return {
      x: nAt(0.125 * p[0].x + 0.375 * p[1].x + 0.375 * p[2].x + 0.125 * p[3].x),
      y: nAt(0.125 * p[0].y + 0.375 * p[1].y + 0.375 * p[2].y + 0.125 * p[3].y)
    };
  }
  function computePorts() {
    const res = edgeEls.map(() => ({
      source: { side: "bottom", offset: 0 },
      target: { side: "top", offset: 0 }
    }));
    const boxOf = (id) => {
      const p = positions[id];
      const sz = sizes[id];
      return { x: p.x, y: p.y, w: sz.w, h: sz.h, shape: shapeById[id] };
    };
    const axisX = (side) => side === "top" || side === "bottom";
    const groups = {};
    edgeEls.forEach((e, i) => {
      const from = boxOf(e.from);
      const to = boxOf(e.to);
      if (from.x === to.x && from.y === to.y) return;
      const exit = raySide2(from, to.x - from.x, to.y - from.y);
      const entry = raySide2(to, from.x - to.x, from.y - to.y);
      const wp = e.waypoints;
      const srcHead = wp && wp.length ? wp[0] : to;
      const tgtHead = wp && wp.length ? wp[wp.length - 1] : from;
      const ov = anchorsOv[i];
      if (ov && ov.source) {
        res[i].source = { side: ov.source.side, offset: ov.source.offset };
      } else {
        res[i].source = { side: exit, offset: 0 };
        const gs = e.from + "|" + exit;
        (groups[gs] || (groups[gs] = [])).push({ i, role: "source", along: axisX(exit) ? srcHead.x : srcHead.y });
      }
      if (ov && ov.target) {
        res[i].target = { side: ov.target.side, offset: ov.target.offset };
      } else {
        res[i].target = { side: entry, offset: 0 };
        const gt = e.to + "|" + entry;
        (groups[gt] || (groups[gt] = [])).push({ i, role: "target", along: axisX(entry) ? tgtHead.x : tgtHead.y });
      }
    });
    for (const key in groups) {
      const recs = groups[key];
      if (recs.length < 2) continue;
      const side = key.slice(key.lastIndexOf("|") + 1);
      const b = boxOf(key.slice(0, key.lastIndexOf("|")));
      const borderLen = side === "top" || side === "bottom" ? b.w : b.h;
      recs.sort((a, c) => a.along - c.along || a.i - c.i || a.role.localeCompare(c.role));
      const k = recs.length;
      const step = Math.min(30, (borderLen - 2 * 6) / (k - 1));
      recs.forEach((r, slot) => {
        res[r.i][r.role].offset = (slot - (k - 1) / 2) * step;
      });
    }
    const deskewer = (nodeId, sideA, sideB) => {
      const ra = groups[nodeId + "|" + sideA];
      const rb = groups[nodeId + "|" + sideB];
      if (!ra || !rb || ra.length !== 1 || rb.length !== 1) return;
      const box = boxOf(nodeId);
      const axisIsX = sideA === "top" || sideA === "bottom";
      const c = axisIsX ? box.x : box.y;
      const farOff = (rec2) => {
        const e = edgeEls[rec2.i];
        const fb = boxOf(rec2.role === "target" ? e.from : e.to);
        return fb ? (axisIsX ? fb.x : fb.y) - c : void 0;
      };
      const dA = farOff(ra[0]);
      const dB = farOff(rb[0]);
      if (dA === void 0 || dB === void 0) return;
      const tol = 30 / 2;
      if (Math.sign(dA) === Math.sign(dB) || Math.abs(dA) < tol || Math.abs(dB) < tol) return;
      if ((axisIsX ? box.w : box.h) / 2 - 6 < tol) return;
      const rec = ra[0];
      res[rec.i][rec.role].offset = Math.sign(dA) * tol;
    };
    const skNodes = {};
    for (const key in groups) skNodes[key.slice(0, key.lastIndexOf("|"))] = true;
    for (const nodeId in skNodes) {
      deskewer(nodeId, "top", "bottom");
      deskewer(nodeId, "left", "right");
    }
    const pairs = {};
    edgeEls.forEach((e, i) => {
      if (!e.label) return;
      const from = boxOf(e.from);
      const to = boxOf(e.to);
      if (from.x === to.x && from.y === to.y) return;
      const key = e.from < e.to ? e.from + "|" + e.to : e.to + "|" + e.from;
      (pairs[key] || (pairs[key] = [])).push(i);
    });
    for (const key in pairs) {
      const idxs = pairs[key];
      if (idxs.length < 2) continue;
      idxs.sort((a2, c) => a2 - c);
      const first = edgeEls[idxs[0]];
      const a = boxOf(first.from);
      const b = boxOf(first.to);
      const runX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      const extent = (i) => {
        const lns = edgeEls[i].label.split("\n");
        const maxChars = lns.reduce((m, l) => Math.max(m, l.length), 0);
        return runX ? maxChars * (tokens.font.size * 0.6) + 6 : lns.length * tokens.font.lineHeight + 2;
      };
      const pos = [0];
      for (let s = 1; s < idxs.length; s++) {
        pos.push(pos[s - 1] + (extent(idxs[s - 1]) + extent(idxs[s])) / 2 + 6);
      }
      const center = (pos[0] + pos[pos.length - 1]) / 2;
      idxs.forEach((i, s) => {
        const d = pos[s] - center;
        res[i].labelShift = runX ? { x: d, y: 0 } : { x: 0, y: d };
      });
    }
    return res;
  }
  function plateSizeOf(label) {
    const lns = label.split("\n");
    const maxChars = lns.reduce((m, l) => Math.max(m, l.length), 0);
    return { w: maxChars * tokens.font.size * 0.6 + 6, h: lns.length * tokens.font.lineHeight + 2 };
  }
  function resolveLabelCollisions2(plates) {
    const shifts = plates.map(() => ({ x: 0, y: 0 }));
    const idxs = [];
    plates.forEach((p, i) => {
      if (p) idxs.push(i);
    });
    if (idxs.length < 2) return shifts;
    const cx = plates.map((p) => p ? p.x : 0);
    const cy = plates.map((p) => p ? p.y : 0);
    for (let pass = 0; pass < 8; pass++) {
      let moved2 = false;
      for (let a = 0; a < idxs.length; a++) {
        for (let b = a + 1; b < idxs.length; b++) {
          const i = idxs[a];
          const j = idxs[b];
          const pi = plates[i];
          const pj = plates[j];
          const dx = cx[j] - cx[i];
          const dy = cy[j] - cy[i];
          const ox = (pi.w + pj.w) / 2 + 6 - Math.abs(dx);
          const oy = (pi.h + pj.h) / 2 + 6 - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          moved2 = true;
          if (ox <= oy) {
            const push = ox / 2;
            const dir = dx === 0 ? 1 : Math.sign(dx);
            cx[i] = cx[i] - push * dir;
            cx[j] = cx[j] + push * dir;
          } else {
            const push = oy / 2;
            const dir = dy === 0 ? 1 : Math.sign(dy);
            cy[i] = cy[i] - push * dir;
            cy[j] = cy[j] + push * dir;
          }
        }
      }
      if (!moved2) break;
    }
    for (const i of idxs) shifts[i] = { x: nAt(cx[i] - plates[i].x), y: nAt(cy[i] - plates[i].y) };
    return shifts;
  }
  function segmentsCross2(a1, a2, b1, b2) {
    const rx = a2.x - a1.x;
    const ry = a2.y - a1.y;
    const sx = b2.x - b1.x;
    const sy = b2.y - b1.y;
    const denom = rx * sy - ry * sx;
    if (denom === 0) return null;
    const qpx = b1.x - a1.x;
    const qpy = b1.y - a1.y;
    const t = (qpx * sy - qpy * sx) / denom;
    const u = (qpx * ry - qpy * rx) / denom;
    if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) return { x: a1.x + t * rx, y: a1.y + t * ry };
    return null;
  }
  function gappedPath2(points, gaps) {
    const bySeg = {};
    for (const g of gaps) (bySeg[g.seg] || (bySeg[g.seg] = [])).push({ at: g.at, dist: g.dist });
    for (const k in bySeg) bySeg[k].sort((p, q) => p.dist - q.dist);
    let d = "M " + nAt(points[0].x) + " " + nAt(points[0].y);
    for (let s = 0; s + 1 < points.length; s++) {
      const p = points[s];
      const q = points[s + 1];
      const segGaps = bySeg[s];
      if (!segGaps || !segGaps.length) {
        d += " L " + nAt(q.x) + " " + nAt(q.y);
        continue;
      }
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const ux = (q.x - p.x) / len;
      const uy = (q.y - p.y) / len;
      let lastGapDist = -Infinity;
      for (const g of segGaps) {
        if (g.dist - lastGapDist < 8) continue;
        lastGapDist = g.dist;
        const ex = g.at.x - ux * 4;
        const ey = g.at.y - uy * 4;
        const xx = g.at.x + ux * 4;
        const xy = g.at.y + uy * 4;
        d += " L " + nAt(ex) + " " + nAt(ey) + " M " + nAt(xx) + " " + nAt(xy);
      }
      d += " L " + nAt(q.x) + " " + nAt(q.y);
    }
    return d;
  }
  function applyEdgeBridges2(polys, enabled) {
    const out = polys.map(() => null);
    if (!enabled) return out;
    const rp = polys.map((pts) => pts.map((p) => ({ x: nAt(p.x), y: nAt(p.y) })));
    const gaps = polys.map(() => []);
    for (let i = 0; i < rp.length; i++) {
      const pi = rp[i];
      if (pi.length < 2) continue;
      for (let j = i + 1; j < rp.length; j++) {
        const pj = rp[j];
        if (pj.length < 2) continue;
        for (let si = 0; si + 1 < pi.length; si++) {
          const a1 = pi[si];
          const a2 = pi[si + 1];
          for (let sj = 0; sj + 1 < pj.length; sj++) {
            const b1 = pj[sj];
            const b2 = pj[sj + 1];
            const x = segmentsCross2(a1, a2, b1, b2);
            if (!x) continue;
            const horizI = Math.abs(a2.x - a1.x) >= Math.abs(a2.y - a1.y);
            const horizJ = Math.abs(b2.x - b1.x) >= Math.abs(b2.y - b1.y);
            const iGaps = horizI === horizJ ? true : !horizI;
            const ge = iGaps ? i : j;
            const gs = iGaps ? si : sj;
            const s1 = iGaps ? a1 : b1;
            const s2 = iGaps ? a2 : b2;
            const dEntry = Math.hypot(x.x - s1.x, x.y - s1.y);
            const dExit = Math.hypot(x.x - s2.x, x.y - s2.y);
            if (dEntry < 4 || dExit < 4) continue;
            gaps[ge].push({ seg: gs, at: x, dist: dEntry });
          }
        }
      }
    }
    for (let e = 0; e < rp.length; e++) if (gaps[e].length) out[e] = gappedPath2(rp[e], gaps[e]);
    return out;
  }
  function shiftLabelOnSeg2(e, vertical, seg, target) {
    const lp = e.labelPos;
    if (!lp) return;
    if (vertical) {
      if (Math.abs(lp.x - seg.along) < 26 && lp.y >= seg.lo - 1 && lp.y <= seg.hi + 1) {
        e.labelPos = { x: nAt(lp.x + (target - seg.along)), y: lp.y };
      }
    } else if (Math.abs(lp.y - seg.along) < 26 && lp.x >= seg.lo - 1 && lp.x <= seg.hi + 1) {
      e.labelPos = { x: lp.x, y: nAt(lp.y + (target - seg.along)) };
    }
  }
  function avoidSubgraphs2(edges, pairs, containers) {
    if (edgeStyle !== "elbow" || !containers.length) return;
    const MARGIN2 = 28;
    const MIN_CROSS = 120;
    const APPROACH = 30;
    const moveLane2 = (e, vertical, seg, target) => {
      const p = e.points;
      if (vertical) {
        shiftLabelOnSeg2(e, true, seg, target);
        p[seg.i] = { x: target, y: p[seg.i].y };
        p[seg.i + 1] = { x: target, y: p[seg.i + 1].y };
      } else {
        shiftLabelOnSeg2(e, false, seg, target);
        p[seg.i] = { x: p[seg.i].x, y: target };
        p[seg.i + 1] = { x: p[seg.i + 1].x, y: target };
      }
      seg.along = target;
    };
    const lowerReentry2 = (p, trunkEndIdx, cornerIdx, anchor2, vertical) => {
      if (cornerIdx < 0 || cornerIdx >= p.length || trunkEndIdx < 0 || trunkEndIdx >= p.length) return;
      const anchorPar = vertical ? anchor2.y : anchor2.x;
      const cornerOld = vertical ? p[cornerIdx].y : p[cornerIdx].x;
      const dir = Math.sign(cornerOld - anchorPar);
      if (dir === 0) return;
      const target = nAt(anchorPar + dir * APPROACH);
      if (Math.abs(target - anchorPar) >= Math.abs(cornerOld - anchorPar)) return;
      if (vertical) {
        p[cornerIdx] = { x: p[cornerIdx].x, y: target };
        p[trunkEndIdx] = { x: p[trunkEndIdx].x, y: target };
      } else {
        p[cornerIdx] = { x: target, y: p[cornerIdx].y };
        p[trunkEndIdx] = { x: target, y: p[trunkEndIdx].y };
      }
    };
    const moved2 = {};
    edges.forEach((e, ei) => {
      const p = e.points;
      const len = p.length;
      if (len < 4) return;
      const ep = pairs[ei];
      let best;
      for (let i = 1; i + 2 < len; i++) {
        const a = p[i];
        const b = p[i + 1];
        const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
        const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
        if (!isVert && !isHorz) continue;
        const along3 = isVert ? a.x : a.y;
        const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
        const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
        const runLen = hi - lo;
        for (const c of containers) {
          if (c.members[ep.from] && c.members[ep.to]) continue;
          if (i === 1 && c.members[ep.from] || i === len - 3 && c.members[ep.to]) continue;
          const cx0 = c.box.x - c.box.w / 2;
          const cx1 = c.box.x + c.box.w / 2;
          const cy0 = c.box.y - c.box.h / 2;
          const cy1 = c.box.y + c.box.h / 2;
          const perpLo = isVert ? cx0 : cy0;
          const perpHi = isVert ? cx1 : cy1;
          const parLo = isVert ? cy0 : cx0;
          const parHi = isVert ? cy1 : cx1;
          if (along3 <= perpLo || along3 >= perpHi) continue;
          if (Math.min(hi, parHi) - Math.max(lo, parLo) < MIN_CROSS) continue;
          const side = along3 - perpLo <= perpHi - along3 ? nAt(perpLo - MARGIN2) : nAt(perpHi + MARGIN2);
          if (!best || runLen > best.runLen) best = { i, vertical: isVert, along: along3, lo, hi, side, container: c, runLen };
        }
      }
      if (!best) return;
      moveLane2(edges[ei], best.vertical, { i: best.i, along: best.along, lo: best.lo, hi: best.hi }, best.side);
      moved2[ei] = true;
      if (best.container.members[ep.from]) lowerReentry2(p, best.i, best.i - 1, p[0], best.vertical);
      if (best.container.members[ep.to]) lowerReentry2(p, best.i + 1, best.i + 2, p[len - 1], best.vertical);
    });
    for (const kk in moved2) edges[Number(kk)].path = pathPoly(edges[Number(kk)].points);
  }
  function avoidContainersFrom(boxOf) {
    const out = [];
    for (const sg of model.subgraphs) {
      const ids = subgraphMembers[sg.id] || [];
      if (!ids.length) continue;
      const members = {};
      for (const id of ids) members[id] = true;
      out.push({ box: boxOf(sg), members });
    }
    return out;
  }
  const NODE_AVOID_MARGIN2 = 14;
  const NODE_AVOID_MIN_CROSS2 = 14;
  const NODE_AVOID_PASSES2 = 4;
  const isOrthoT = (pts) => {
    for (let i = 0; i + 1 < pts.length; i++) if (Math.abs(pts[i].x - pts[i + 1].x) >= 0.5 && Math.abs(pts[i].y - pts[i + 1].y) >= 0.5) return false;
    return true;
  };
  const orthoPathT = (pts) => edgeStyle === "curved" ? pathRounded(pts) : pathPoly(pts);
  function avoidNodes2(edges, pairs, nodeBoxes) {
    if (!nodeBoxes.length) return;
    const moveLane2 = (e, vertical, seg, target) => {
      const p = e.points;
      if (vertical) {
        shiftLabelOnSeg2(e, true, seg, target);
        p[seg.i] = { x: target, y: p[seg.i].y };
        p[seg.i + 1] = { x: target, y: p[seg.i + 1].y };
      } else {
        shiftLabelOnSeg2(e, false, seg, target);
        p[seg.i] = { x: p[seg.i].x, y: target };
        p[seg.i + 1] = { x: p[seg.i + 1].x, y: target };
      }
      seg.along = target;
    };
    const moved2 = {};
    edges.forEach((e, ei) => {
      const p = e.points;
      const len = p.length;
      if (len < 4 || edgeStyle === "curved" && !isOrthoT(p)) return;
      const ep = pairs[ei];
      let best;
      for (let i = 1; i + 2 < len; i++) {
        const a = p[i];
        const b = p[i + 1];
        const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
        const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
        if (!isVert && !isHorz) continue;
        const along3 = isVert ? a.x : a.y;
        const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
        const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
        const runLen = hi - lo;
        for (const nb of nodeBoxes) {
          if (nb.id === ep.from || nb.id === ep.to) continue;
          const cx0 = nb.x - nb.w / 2;
          const cx1 = nb.x + nb.w / 2;
          const cy0 = nb.y - nb.h / 2;
          const cy1 = nb.y + nb.h / 2;
          const perpLo = isVert ? cx0 : cy0;
          const perpHi = isVert ? cx1 : cy1;
          const parLo = isVert ? cy0 : cx0;
          const parHi = isVert ? cy1 : cx1;
          if (along3 <= perpLo || along3 >= perpHi) continue;
          if (Math.min(hi, parHi) - Math.max(lo, parLo) < NODE_AVOID_MIN_CROSS2) continue;
          const side = along3 - perpLo <= perpHi - along3 ? nAt(perpLo - NODE_AVOID_MARGIN2) : nAt(perpHi + NODE_AVOID_MARGIN2);
          if (!best || runLen > best.runLen) best = { i, vertical: isVert, along: along3, lo, hi, side, runLen };
        }
      }
      if (!best) return;
      moveLane2(edges[ei], best.vertical, { i: best.i, along: best.along, lo: best.lo, hi: best.hi }, best.side);
      moved2[ei] = true;
    });
    for (const kk in moved2) edges[Number(kk)].path = orthoPathT(edges[Number(kk)].points);
  }
  function detourApproaches2(edges, pairs, nodeBoxes) {
    if (!nodeBoxes.length) return;
    const spans = (nb) => ({ l: nb.x - nb.w / 2, r: nb.x + nb.w / 2, t: nb.y - nb.h / 2, b: nb.y + nb.h / 2 });
    const detour = (a, pp, nb) => {
      const s = spans(nb);
      if (Math.abs(a.x - pp.x) < 0.5) {
        const sideX = a.x - s.l <= s.r - a.x ? nAt(s.l - NODE_AVOID_MARGIN2) : nAt(s.r + NODE_AVOID_MARGIN2);
        const gapY = pp.y > a.y ? nAt(s.b + NODE_AVOID_MARGIN2) : nAt(s.t - NODE_AVOID_MARGIN2);
        return [{ x: sideX, y: a.y }, { x: sideX, y: gapY }, { x: nAt(a.x), y: gapY }];
      }
      const sideY = a.y - s.t <= s.b - a.y ? nAt(s.t - NODE_AVOID_MARGIN2) : nAt(s.b + NODE_AVOID_MARGIN2);
      const gapX = pp.x > a.x ? nAt(s.r + NODE_AVOID_MARGIN2) : nAt(s.l - NODE_AVOID_MARGIN2);
      return [{ x: a.x, y: sideY }, { x: gapX, y: sideY }, { x: gapX, y: nAt(a.y) }];
    };
    const pierces = (a, pp, nb) => {
      const s = spans(nb);
      const vert = Math.abs(a.x - pp.x) < 0.5;
      if (!vert && Math.abs(a.y - pp.y) >= 0.5) return false;
      const along3 = vert ? a.x : a.y;
      const lo = vert ? Math.min(a.y, pp.y) : Math.min(a.x, pp.x);
      const hi = vert ? Math.max(a.y, pp.y) : Math.max(a.x, pp.x);
      const perpLo = vert ? s.l : s.t;
      const perpHi = vert ? s.r : s.b;
      const parLo = vert ? s.t : s.l;
      const parHi = vert ? s.b : s.r;
      if (along3 <= perpLo || along3 >= perpHi) return false;
      return Math.min(hi, parHi) - Math.max(lo, parLo) >= NODE_AVOID_MIN_CROSS2;
    };
    const changed = {};
    edges.forEach((e, ei) => {
      const p = e.points;
      if (p.length < 2 || edgeStyle === "curved" && !isOrthoT(p)) return;
      const ep = pairs[ei];
      const a = p[p.length - 2];
      const port = p[p.length - 1];
      for (const nb of nodeBoxes) {
        if (nb.id === ep.from || nb.id === ep.to) continue;
        if (pierces(a, port, nb)) {
          p.splice(p.length - 1, 0, ...detour(a, port, nb));
          changed[ei] = true;
          break;
        }
      }
    });
    for (const kk in changed) {
      const e = edges[Number(kk)];
      const sp = simplify2(e.points);
      e.points.splice(0, e.points.length, ...sp);
      e.path = orthoPathT(e.points);
    }
  }
  function trimEndpointReentry2(edges, pairs, nodeBoxes) {
    const boxById = {};
    for (const b of nodeBoxes) if (b.id) boxById[b.id] = b;
    const inside = (pt, b) => pt.x > b.x - b.w / 2 + 0.5 && pt.x < b.x + b.w / 2 - 0.5 && pt.y > b.y - b.h / 2 + 0.5 && pt.y < b.y + b.h / 2 - 0.5;
    const cross = (inPt, outPt, b) => Math.abs(inPt.x - outPt.x) < 0.5 ? { x: nAt(inPt.x), y: nAt(outPt.y > inPt.y ? b.y + b.h / 2 : b.y - b.h / 2) } : { x: nAt(outPt.x > inPt.x ? b.x + b.w / 2 : b.x - b.w / 2), y: nAt(inPt.y) };
    edges.forEach((e, ei) => {
      const p = e.points;
      if (p.length < 3 || edgeStyle === "curved" && !isOrthoT(p)) return;
      const ep = pairs[ei];
      const ov = anchorsOv[ei];
      const src = ov && ov.source ? void 0 : boxById[ep.from];
      const tgt = ov && ov.target ? void 0 : boxById[ep.to];
      let did = false;
      if (src && inside(p[1], src)) {
        let k = 1;
        while (k < p.length && inside(p[k], src)) k++;
        if (k < p.length) {
          p.splice(0, k, cross(p[k - 1], p[k], src));
          did = true;
        }
      }
      if (tgt && p.length >= 3 && inside(p[p.length - 2], tgt)) {
        let j = p.length - 2;
        while (j >= 0 && inside(p[j], tgt)) j--;
        if (j >= 0) {
          p.splice(j + 1, p.length - 1 - j, cross(p[j + 1], p[j], tgt));
          did = true;
        }
      }
      if (did) {
        const sp = simplify2(p);
        p.splice(0, p.length, ...sp);
        e.path = orthoPathT(p);
      }
    });
  }
  const avoidNodeBoxes = (boxOf) => model.nodes.map((nd) => {
    const b = boxOf(nd.id);
    return { id: nd.id, x: b.x, y: b.y, w: b.w, h: b.h };
  });
  function separateLanes2(edges) {
    if (edgeStyle !== "elbow" && edgeStyle !== "curved") return;
    const LANE_GAP2 = 26;
    const LANE_MIN_OVERLAP2 = 40;
    const LANE_PASSES2 = 8;
    const moved2 = {};
    const moveLane2 = (e, vertical, seg, target) => {
      const p = e.points;
      if (vertical) {
        shiftLabelOnSeg2(e, true, seg, target);
        p[seg.i] = { x: target, y: p[seg.i].y };
        p[seg.i + 1] = { x: target, y: p[seg.i + 1].y };
      } else {
        shiftLabelOnSeg2(e, false, seg, target);
        p[seg.i] = { x: p[seg.i].x, y: target };
        p[seg.i + 1] = { x: p[seg.i + 1].x, y: target };
      }
      seg.along = target;
    };
    for (let pass = 0; pass < LANE_PASSES2; pass++) {
      let changed = false;
      for (const vertical of [true, false]) {
        const segs = [];
        edges.forEach((e, ei) => {
          const p = e.points;
          for (let i = 1; i + 2 < p.length; i++) {
            const a = p[i];
            const b = p[i + 1];
            const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
            const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
            if (vertical ? !isVert : !isHorz) continue;
            const along3 = vertical ? a.x : a.y;
            const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
            const hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
            segs.push({ edge: ei, i, along: along3, lo, hi });
          }
        });
        segs.sort((s, t) => s.along - t.along || s.edge - t.edge || s.i - t.i);
        for (let a = 0; a < segs.length; a++) {
          for (let b = a + 1; b < segs.length; b++) {
            const sa = segs[a];
            const sb = segs[b];
            if (sa.edge === sb.edge) continue;
            if (Math.min(sa.hi, sb.hi) - Math.max(sa.lo, sb.lo) < LANE_MIN_OVERLAP2) continue;
            const d = LANE_GAP2 - Math.abs(sb.along - sa.along);
            if (d <= 1e-6) continue;
            const dir = sb.along >= sa.along ? 1 : -1;
            const push = d / 2;
            moveLane2(edges[sa.edge], vertical, sa, nAt(sa.along - push * dir));
            moveLane2(edges[sb.edge], vertical, sb, nAt(sb.along + push * dir));
            moved2[sa.edge] = true;
            moved2[sb.edge] = true;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    for (const kk in moved2) edges[Number(kk)].path = orthoPathT(edges[Number(kk)].points);
  }
  function separateAntiParallelJogs2(edges, pairs) {
    if (edgeStyle !== "elbow") return;
    const JOG_GAP2 = 26;
    const moveLane2 = (e, vertical, seg, target) => {
      const p = e.points;
      if (vertical) {
        shiftLabelOnSeg2(e, true, seg, target);
        p[seg.i] = { x: target, y: p[seg.i].y };
        p[seg.i + 1] = { x: target, y: p[seg.i + 1].y };
      } else {
        shiftLabelOnSeg2(e, false, seg, target);
        p[seg.i] = { x: p[seg.i].x, y: target };
        p[seg.i + 1] = { x: p[seg.i + 1].x, y: target };
      }
      seg.along = target;
    };
    const groups = {};
    pairs.forEach((e, i) => {
      const key = e.from < e.to ? e.from + "|" + e.to : e.to + "|" + e.from;
      (groups[key] = groups[key] || []).push(i);
    });
    const moved2 = {};
    for (const key in groups) {
      const idxs = groups[key];
      if (idxs.length < 2) continue;
      idxs.sort((a, b) => a - b);
      const jogs = [];
      let orient;
      for (const ei of idxs) {
        const p = edges[ei].points;
        let jog;
        for (let i = 1; i + 2 < p.length; i++) {
          const a = p[i];
          const b = p[i + 1];
          const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
          const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
          if (!isVert && !isHorz) continue;
          const along3 = isVert ? a.x : a.y;
          const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
          const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
          const end = p[p.length - 1];
          const target = isVert ? end.x : end.y;
          jog = { edge: ei, seg: { edge: ei, i, along: along3, lo, hi }, vertical: isVert, target };
          break;
        }
        if (!jog) break;
        if (orient === void 0) orient = jog.vertical;
        else if (orient !== jog.vertical) {
          jogs.length = 0;
          break;
        }
        jogs.push(jog);
      }
      if (jogs.length < 2) continue;
      const a0 = jogs[0].seg.along;
      let collinear = true;
      for (const j of jogs) if (Math.abs(j.seg.along - a0) >= 1) collinear = false;
      if (!collinear) continue;
      jogs.sort((x, y) => x.target - y.target || x.edge - y.edge);
      let sum = 0;
      for (const j of jogs) sum += j.seg.along;
      const mean = sum / jogs.length;
      const k = jogs.length;
      jogs.forEach((j, s) => {
        const lane = nAt(mean + (s - (k - 1) / 2) * JOG_GAP2);
        if (Math.abs(lane - j.seg.along) < 1e-6) return;
        moveLane2(edges[j.edge], j.vertical, j.seg, lane);
        moved2[j.edge] = true;
      });
    }
    for (const kk in moved2) edges[Number(kk)].path = pathPoly(edges[Number(kk)].points);
  }
  function separateConvergentJogs2(edges, pairs) {
    if (edgeStyle !== "elbow") return;
    const JOG_GAP2 = 26;
    const CONVERGE_MIN2 = 3;
    const moveLane2 = (e, vertical, seg, target) => {
      const p = e.points;
      if (vertical) {
        shiftLabelOnSeg2(e, true, seg, target);
        p[seg.i] = { x: target, y: p[seg.i].y };
        p[seg.i + 1] = { x: target, y: p[seg.i + 1].y };
      } else {
        shiftLabelOnSeg2(e, false, seg, target);
        p[seg.i] = { x: p[seg.i].x, y: target };
        p[seg.i + 1] = { x: p[seg.i + 1].x, y: target };
      }
      seg.along = target;
    };
    const jogOf = (p, role) => {
      const len = p.length;
      if (len < 4) return null;
      const i = role === "target" ? len - 3 : 1;
      if (i < 1 || i + 2 > len) return null;
      const a = p[i];
      const b = p[i + 1];
      const isVert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 1;
      const isHorz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 1;
      if (!isVert && !isHorz) return null;
      const along3 = isVert ? a.x : a.y;
      const lo = isVert ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
      const hi = isVert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
      const appFrom = role === "target" ? p[i + 1] : p[1];
      const appTo = role === "target" ? p[len - 1] : p[0];
      const toward = isVert ? Math.sign(appTo.x - appFrom.x) : Math.sign(appTo.y - appFrom.y);
      const end = role === "target" ? p[0] : p[len - 1];
      const far = isVert ? end.x : end.y;
      return { seg: { edge: 0, i, along: along3, lo, hi }, vertical: isVert, toward, far };
    };
    const buckets = {};
    edges.forEach((e, idx) => {
      const ep = pairs[idx];
      const roles = [["source", ep.from], ["target", ep.to]];
      for (const [role, node] of roles) {
        const j = jogOf(e.points, role);
        if (!j) continue;
        const key = node + "|" + (j.vertical ? "V" : "H") + "|" + j.toward + "|" + nAt(j.seg.along);
        const rec = { edge: idx, seg: { edge: idx, i: j.seg.i, along: j.seg.along, lo: j.seg.lo, hi: j.seg.hi }, vertical: j.vertical, toward: j.toward, far: j.far };
        (buckets[key] || (buckets[key] = [])).push(rec);
      }
    });
    const moved2 = {};
    for (const key in buckets) {
      const recs = buckets[key];
      if (recs.length < CONVERGE_MIN2) continue;
      recs.sort((x, y) => x.far - y.far || x.edge - y.edge);
      let sum = 0;
      for (const r of recs) sum += r.seg.along;
      const mean = sum / recs.length;
      const k = recs.length;
      const toward = recs[0].toward;
      recs.forEach((r, s) => {
        const lane = nAt(mean + (s - (k - 1) / 2 - toward * (k - 1) / 2) * JOG_GAP2);
        if (Math.abs(lane - r.seg.along) < 1e-6) return;
        moveLane2(edges[r.edge], r.vertical, r.seg, lane);
        moved2[r.edge] = true;
      });
    }
    for (const kk in moved2) edges[Number(kk)].path = pathPoly(edges[Number(kk)].points);
  }
  function resolveLabelNodeCollisions2(plates, nodeBoxes) {
    const shifts = plates.map(() => ({ x: 0, y: 0 }));
    if (!nodeBoxes.length) return shifts;
    const cx = plates.map((p) => p ? p.x : 0);
    const cy = plates.map((p) => p ? p.y : 0);
    for (let pass = 0; pass < 4; pass++) {
      let moved2 = false;
      for (let i = 0; i < plates.length; i++) {
        const p = plates[i];
        if (!p) continue;
        for (const nb of nodeBoxes) {
          const dx = cx[i] - nb.x;
          const dy = cy[i] - nb.y;
          const ox = (p.w + nb.w) / 2 + 10 - Math.abs(dx);
          const oy = (p.h + nb.h) / 2 + 10 - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          moved2 = true;
          if (oy <= ox) cy[i] = cy[i] + oy * (dy < 0 ? -1 : 1);
          else cx[i] = cx[i] + ox * (dx < 0 ? -1 : 1);
        }
      }
      if (!moved2) break;
    }
    for (let i = 0; i < plates.length; i++) if (plates[i]) shifts[i] = { x: nAt(cx[i] - plates[i].x), y: nAt(cy[i] - plates[i].y) };
    return shifts;
  }
  function nearestRunAxis2(points, cx, cy) {
    let best = Infinity;
    let axis = null;
    for (let s = 0; s + 1 < points.length; s++) {
      const a = points[s];
      const b = points[s + 1];
      const horiz = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5;
      const vert = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 0.5;
      if (!horiz && !vert) continue;
      let dx;
      let dy;
      if (horiz) {
        const lo = Math.min(a.x, b.x);
        const hi = Math.max(a.x, b.x);
        dx = cx < lo ? cx - lo : cx > hi ? cx - hi : 0;
        dy = cy - a.y;
      } else {
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        dx = cx - a.x;
        dy = cy < lo ? cy - lo : cy > hi ? cy - hi : 0;
      }
      const dd = dx * dx + dy * dy;
      if (dd < best) {
        best = dd;
        axis = horiz ? "x" : "y";
      }
    }
    return axis;
  }
  function resolveLabelEdgeCollisions2(plates, polylines) {
    const shifts = plates.map(() => ({ x: 0, y: 0 }));
    const cx = plates.map((p) => p ? p.x : 0);
    const cy = plates.map((p) => p ? p.y : 0);
    for (let pass = 0; pass < 4; pass++) {
      let moved2 = false;
      for (let i = 0; i < plates.length; i++) {
        const p = plates[i];
        if (!p) continue;
        const axis = nearestRunAxis2(polylines[i] ?? [], cx[i], cy[i]);
        if (!axis) continue;
        const hw = p.w / 2;
        const hh = p.h / 2;
        let hasHit = false;
        let hiTarget = -Infinity;
        let loTarget = Infinity;
        for (let j = 0; j < polylines.length; j++) {
          if (j === i) continue;
          const pts = polylines[j] ?? [];
          for (let s = 0; s + 1 < pts.length; s++) {
            const a = pts[s];
            const b = pts[s + 1];
            if (axis === "x") {
              if (Math.abs(a.x - b.x) < 0.5) {
                const gx = a.x;
                if (gx <= cx[i] - hw || gx >= cx[i] + hw) continue;
                if (cy[i] + hh <= Math.min(a.y, b.y) || cy[i] - hh >= Math.max(a.y, b.y)) continue;
                hasHit = true;
                hiTarget = Math.max(hiTarget, gx + hw + 6);
                loTarget = Math.min(loTarget, gx - hw - 6);
              } else if (Math.abs(a.y - b.y) < 0.5) {
                const gy = a.y;
                if (gy <= cy[i] - hh || gy >= cy[i] + hh) continue;
                const lo = Math.min(a.x, b.x);
                const hi = Math.max(a.x, b.x);
                if (cx[i] + hw <= lo || cx[i] - hw >= hi) continue;
                hasHit = true;
                hiTarget = Math.max(hiTarget, hi + hw + 6);
                loTarget = Math.min(loTarget, lo - hw - 6);
              }
            } else {
              if (Math.abs(a.y - b.y) < 0.5) {
                const gy = a.y;
                if (gy <= cy[i] - hh || gy >= cy[i] + hh) continue;
                if (cx[i] + hw <= Math.min(a.x, b.x) || cx[i] - hw >= Math.max(a.x, b.x)) continue;
                hasHit = true;
                hiTarget = Math.max(hiTarget, gy + hh + 6);
                loTarget = Math.min(loTarget, gy - hh - 6);
              } else if (Math.abs(a.x - b.x) < 0.5) {
                const gx = a.x;
                if (gx <= cx[i] - hw || gx >= cx[i] + hw) continue;
                const lo = Math.min(a.y, b.y);
                const hi = Math.max(a.y, b.y);
                if (cy[i] + hh <= lo || cy[i] - hh >= hi) continue;
                hasHit = true;
                hiTarget = Math.max(hiTarget, hi + hh + 6);
                loTarget = Math.min(loTarget, lo - hh - 6);
              }
            }
          }
        }
        if (!hasHit) continue;
        const cur = axis === "x" ? cx[i] : cy[i];
        const target = hiTarget - cur <= cur - loTarget ? hiTarget : loTarget;
        if (axis === "x") cx[i] = target;
        else cy[i] = target;
        moved2 = true;
      }
      if (!moved2) break;
    }
    for (let i = 0; i < plates.length; i++) if (plates[i]) shifts[i] = { x: nAt(cx[i] - plates[i].x), y: nAt(cy[i] - plates[i].y) };
    return shifts;
  }
  function labelPlatesOf(routed) {
    return edgeEls.map((e, i) => {
      if (!e.label) return void 0;
      const s = plateSizeOf(e.label);
      return { x: nAt(routed[i].labelPos.x), y: nAt(routed[i].labelPos.y), w: s.w, h: s.h };
    });
  }
  function foldLabelShifts(routed, shifts) {
    routed.forEach((r, i) => {
      const sh = shifts[i];
      if (edgeEls[i].label && (sh.x !== 0 || sh.y !== 0)) {
        r.labelPos = { x: nAt(r.labelPos.x) + sh.x, y: nAt(r.labelPos.y) + sh.y };
      }
    });
  }
  function resolveLabelLineOffsets2(plates, polylines) {
    return plates.map((p, i) => {
      if (!p) return { x: 0, y: 0 };
      const pts = polylines[i] ?? [];
      if (pts.length < 2) return { x: 0, y: 0 };
      const el = edgeEls[i];
      const cubic = edgeStyle === "curved" && !(el && el.waypoints && el.waypoints.length);
      let a;
      let b;
      if (cubic && pts.length === 4) {
        a = { x: pts[0].x + pts[1].x, y: pts[0].y + pts[1].y };
        b = { x: pts[2].x + pts[3].x, y: pts[2].y + pts[3].y };
      } else if (pts.length === 2) {
        a = pts[0];
        b = pts[1];
      } else {
        const mid = Math.floor(pts.length / 2);
        a = pts[mid - 1];
        b = pts[mid];
      }
      const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
      const dist3 = (horizontal ? p.h : p.w) / 2 + 3;
      return horizontal ? { x: 0, y: -dist3 } : { x: dist3, y: 0 };
    });
  }
  const bridgesEnabled = () => edgeStyle === "elbow" && (opt.bridges ?? true);
  function routeBoxes(from, to, waypoints, ports, isSelf) {
    const shift = ports && ports.labelShift;
    const withShift = (p) => shift ? { x: p.x + shift.x, y: p.y + shift.y } : p;
    if (isSelf) {
      const r = anchor(from, "right");
      const t = anchor(from, "top");
      const off = Math.max(24, from.h * 0.6);
      const pts2 = [r, { x: r.x + off, y: r.y }, { x: r.x + off, y: t.y - off }, { x: t.x, y: t.y - off }, t];
      return { path: pathPoly(pts2), labelPos: labelPoly(pts2), points: pts2 };
    }
    const exit = ports ? ports.source.side : raySide2(from, to.x - from.x, to.y - from.y);
    const entry = ports ? ports.target.side : raySide2(to, from.x - to.x, from.y - to.y);
    const start = anchor(from, exit, ports ? ports.source.offset : 0);
    const end = anchor(to, entry, ports ? ports.target.offset : 0);
    const horizontal = exit === "left" || exit === "right";
    const hasWps = !!(waypoints && waypoints.length > 0);
    if (edgeStyle === "curved" && !hasWps) {
      const k = horizontal ? Math.max(24, Math.abs(end.x - start.x) * 0.5) : Math.max(24, Math.abs(end.y - start.y) * 0.5);
      const c1 = offAlong(start, exit, k);
      const c2 = offAlong(end, entry, k);
      const pts2 = [start, c1, c2, end];
      return { path: pathBezier(pts2), labelPos: withShift(labelBezier(pts2)), points: pts2 };
    }
    const entryVertical = entry === "top" || entry === "bottom";
    let pts;
    if (hasWps) {
      pts = elbowThrough2(
        start,
        end,
        waypoints,
        !horizontal,
        entryVertical,
        !(model.direction === "LR" || model.direction === "RL")
      );
    } else if (horizontal) {
      const midX = (start.x + end.x) / 2;
      pts = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
      perpendicularizeEntry2(pts, entryVertical);
      pts = simplify2(pts);
    } else {
      const midY = (start.y + end.y) / 2;
      pts = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
      perpendicularizeEntry2(pts, entryVertical);
      pts = simplify2(pts);
    }
    const path = edgeStyle === "curved" ? pathRounded(pts) : pathPoly(pts);
    return { path, labelPos: withShift(labelPoly(pts)), points: pts };
  }
  function routeEdgePath(fromId, toId, waypoints, ports) {
    const fp = positions[fromId];
    const tp = positions[toId];
    const fs = sizes[fromId];
    const ts = sizes[toId];
    return routeBoxes(
      { x: fp.x, y: fp.y, w: fs.w, h: fs.h, shape: shapeById[fromId] },
      { x: tp.x, y: tp.y, w: ts.w, h: ts.h, shape: shapeById[toId] },
      waypoints,
      ports,
      fromId === toId
    );
  }
  function styleForNode(_id, classes, inline) {
    const c = tokens.colors;
    let fill = c.surface;
    let stroke = c.surfaceStroke;
    let text = c.text;
    let strokeWidth;
    let strokeDasharray;
    for (const cls of classes) {
      const role = c.roles[cls];
      if (role) {
        fill = role.fill;
        stroke = role.stroke;
        text = role.text;
      }
      const def = classDefs[cls];
      if (def) {
        if (def.fill) fill = def.fill;
        if (def.stroke) stroke = def.stroke;
        if (def.color) text = def.color;
        if (def.strokeWidth) strokeWidth = def.strokeWidth;
        if (def.strokeDasharray) strokeDasharray = def.strokeDasharray;
      }
    }
    if (inline) {
      if (inline.fill) fill = inline.fill;
      if (inline.stroke) stroke = inline.stroke;
      if (inline.color) text = inline.color;
      if (inline.strokeWidth) strokeWidth = inline.strokeWidth;
      if (inline.strokeDasharray) strokeDasharray = inline.strokeDasharray;
    }
    const out = { fill, stroke, text };
    if (strokeWidth !== void 0) out.strokeWidth = strokeWidth;
    if (strokeDasharray !== void 0) out.strokeDasharray = strokeDasharray;
    return out;
  }
  function cardStyle(id, st) {
    const s = sizes[id];
    let radius = tokens.radii.node + "px";
    const shapeEl = model.nodes.find((x) => x.id === id);
    const shape = shapeEl ? shapeEl.shape : "rect";
    if (shape === "stadium" || shape === "circle") radius = "999px";
    else if (shape === "rounded") radius = tokens.radii.card + 4 + "px";
    const borderWidth = st.strokeWidth ? /^[0-9.]+$/.test(st.strokeWidth) ? st.strokeWidth + "px" : st.strokeWidth : "1.5px";
    const borderStyle = st.strokeDasharray ? "dashed" : "solid";
    if (sketch) {
      return "position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:" + s.w + "px;height:" + s.h + "px;padding:0 " + tokens.spacing.nodePadX + "px;cursor:grab;transition:transform .12s ease;font-size:var(--vnm-font-size);font-weight:var(--vnm-font-weight);background:transparent;border:0;color:" + st.text + ";";
    }
    return "position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:" + s.w + "px;height:" + s.h + "px;padding:0 " + tokens.spacing.nodePadX + "px;border-radius:" + radius + ";cursor:grab;transition:box-shadow .12s ease, transform .12s ease;font-size:var(--vnm-font-size);font-weight:var(--vnm-font-weight);box-shadow:var(--vnm-node-shadow);background:" + st.fill + ";border:" + borderWidth + " " + borderStyle + " " + st.stroke + ";color:" + st.text + ";";
  }
  function positionCard(id) {
    const card = cards[id];
    const p = positions[id];
    const s = sizes[id];
    card.style.left = p.x - s.w / 2 + "px";
    card.style.top = p.y - s.h / 2 + "px";
    if (sketch) renderNodeShape(id);
  }
  function renderNodes() {
    for (const id in cards) {
      applyCardSize(id);
      positionCard(id);
    }
  }
  function renderEdges() {
    const ports = computePorts();
    const routed = edgeEls.map((e, i) => routeEdgePath(e.from, e.to, e.waypoints, ports[i]));
    avoidSubgraphs2(routed, edgeEls, avoidContainersFrom(subgraphWorldBox));
    const nabL = avoidNodeBoxes((id) => ({ x: positions[id].x, y: positions[id].y, w: sizes[id].w, h: sizes[id].h }));
    trimEndpointReentry2(routed, edgeEls, nabL);
    for (let k = 0; k < NODE_AVOID_PASSES2; k++) {
      avoidNodes2(routed, edgeEls, nabL);
      detourApproaches2(routed, edgeEls, nabL);
    }
    foldLabelShifts(routed, resolveLabelLineOffsets2(labelPlatesOf(routed), routed.map((r) => r.points)));
    separateLanes2(routed);
    separateAntiParallelJogs2(routed, edgeEls);
    separateConvergentJogs2(routed, edgeEls);
    foldLabelShifts(routed, resolveLabelCollisions2(labelPlatesOf(routed)));
    foldLabelShifts(routed, resolveLabelEdgeCollisions2(labelPlatesOf(routed), routed.map((r) => r.points)));
    const nodeBoxesL = model.nodes.map((nd) => ({ x: positions[nd.id].x, y: positions[nd.id].y, w: sizes[nd.id].w, h: sizes[nd.id].h }));
    foldLabelShifts(routed, resolveLabelNodeCollisions2(labelPlatesOf(routed), nodeBoxesL));
    foldLabelShifts(routed, resolveLabelCollisions2(labelPlatesOf(routed)));
    const bridgedL = applyEdgeBridges2(routed.map((r) => r.points), bridgesEnabled());
    edgeEls.forEach((e, i) => {
      const r = routed[i];
      if (sketch) {
        const sk = sketchEdgeParts(r.points, e.from + "->" + e.to, e.arrows, tokens.edge.arrowSize);
        e.path.setAttribute("d", sk.line);
        if (e.headPath) e.headPath.setAttribute("d", sk.head);
      } else {
        e.path.setAttribute("d", bridgedL[i] ?? r.path);
      }
      if (e.plate && e.text && e.label) {
        const lx = r.labelPos.x;
        const ly = r.labelPos.y;
        const w = e.label.length * (tokens.font.size * 0.6) + 6;
        const h = tokens.font.lineHeight + 2;
        e.plate.setAttribute("x", String(nAt(lx - w / 2)));
        e.plate.setAttribute("y", String(nAt(ly - h / 2)));
        e.plate.setAttribute("width", String(nAt(w)));
        e.plate.setAttribute("height", String(nAt(h)));
        e.text.setAttribute("x", String(nAt(lx)));
        e.text.setAttribute("y", String(nAt(ly)));
      }
    });
    if (capOverlay) {
      let caps = "";
      edgeEls.forEach((e, i) => {
        caps += svgEdgeArrowCap(e, routed[i].points);
      });
      capOverlay.innerHTML = caps;
    }
    positionEdgeHandles(ports);
  }
  function applyTransform() {
    world.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
    drawMinimap();
  }
  function renderAll() {
    renderNodes();
    renderSubgraphs();
    renderEdges();
    positionHandles();
    applyTransform();
  }
  function drawMinimap() {
    if (!minimap) return;
    const ctx = minimap.getContext("2d");
    if (!ctx) return;
    const mw = minimap.width;
    const mh = minimap.height;
    ctx.clearRect(0, 0, mw, mh);
    const s = Math.min(mw / Math.max(contentW, 1), mh / Math.max(contentH, 1));
    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = tokens.colors.accent;
    for (const nd of model.nodes) {
      const p = positions[nd.id];
      const sz = sizes[nd.id];
      ctx.globalAlpha = 0.75;
      ctx.fillRect(p.x - sz.w / 2, p.y - sz.h / 2, sz.w, sz.h);
    }
    ctx.restore();
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const vx = -tx / scale * s;
    const vy = -ty / scale * s;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = tokens.colors.accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw / scale * s, vh / scale * s);
    ctx.fillStyle = tokens.colors.minimapViewport;
    ctx.fillRect(vx, vy, vw / scale * s, vh / scale * s);
  }
  function clampScale(v) {
    return Math.max(opt.minScale, Math.min(opt.maxScale, v));
  }
  function fit() {
    const vw = viewport.clientWidth || 800;
    const vh = viewport.clientHeight || 600;
    const pad = opt.fitPadding;
    const s = clampScale(Math.min((vw - pad * 2) / Math.max(contentW, 1), (vh - pad * 2) / Math.max(contentH, 1)));
    scale = s;
    tx = (vw - contentW * s) / 2;
    ty = (vh - contentH * s) / 2;
    applyTransform();
  }
  function zoomBy(factor) {
    zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, clampScale(scale * factor));
  }
  function zoomAt(cx, cy, next) {
    const wx = (cx - tx) / scale;
    const wy = (cy - ty) / scale;
    scale = next;
    tx = cx - wx * scale;
    ty = cy - wy * scale;
    applyTransform();
  }
  function resetView() {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  }
  const SLOP = 4;
  let mode = "none";
  let dragId = null;
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;
  let startPos = { x: 0, y: 0 };
  let moved = false;
  let resizeId = null;
  let rsx = 0;
  let rsy = 0;
  let rFixedX = 0;
  let rFixedY = 0;
  let rMovableX = 0;
  let rMovableY = 0;
  let anchorEi = -1;
  let anchorEnd = "source";
  let anchorNode = "";
  let groupMembers = [];
  let groupStart = {};
  function pointerWorld(ev) {
    const rect = viewport.getBoundingClientRect();
    return { x: (ev.clientX - rect.left - tx) / scale, y: (ev.clientY - rect.top - ty) / scale };
  }
  const GRAB = 10;
  function subgraphHit(wx, wy) {
    let best = null;
    let bestArea = Infinity;
    for (const sg of model.subgraphs) {
      if (!(subgraphMembers[sg.id] || []).length) continue;
      const b = subgraphWorldBox(sg);
      const left = b.x - b.w / 2;
      const right = b.x + b.w / 2;
      const top = b.y - b.h / 2;
      const bottom = b.y + b.h / 2;
      if (wx < left || wx > right || wy < top || wy > bottom) continue;
      const nearBorder = wx <= left + GRAB || wx >= right - GRAB || wy <= top + GRAB || wy >= bottom - GRAB;
      const inTitle = !!sg.title && wy <= top + SG_PAD + SG_TITLE;
      if (!nearBorder && !inTitle) continue;
      const area = b.w * b.h;
      if (area < bestArea) {
        bestArea = area;
        best = sg.id;
      }
    }
    return best;
  }
  function onPointerDown(ev) {
    const target = ev.target;
    if (target.closest && target.closest(".vnm-toolbar")) return;
    const epHandle = target.closest ? target.closest(".vnm-edge-handle") : null;
    if (epHandle && epHandle.dataset.ei !== void 0) {
      mode = "anchor";
      anchorEi = Number(epHandle.dataset.ei);
      anchorEnd = epHandle.dataset.end === "target" ? "target" : "source";
      const e = edgeEls[anchorEi];
      anchorNode = anchorEnd === "source" ? e.from : e.to;
      moved = false;
      startX = ev.clientX;
      startY = ev.clientY;
      viewport.setPointerCapture(ev.pointerId);
      return;
    }
    const handle = target.closest ? target.closest(".vnm-resize-handle") : null;
    if (handle && selected && positions[selected]) {
      mode = "resize";
      resizeId = selected;
      rsx = Number(handle.dataset.sx);
      rsy = Number(handle.dataset.sy);
      const c = positions[resizeId];
      const s = sizes[resizeId];
      rFixedX = c.x - rsx * s.w / 2;
      rFixedY = c.y - rsy * s.h / 2;
      rMovableX = c.x + rsx * s.w / 2;
      rMovableY = c.y + rsy * s.h / 2;
      moved = false;
      startX = ev.clientX;
      startY = ev.clientY;
      viewport.setPointerCapture(ev.pointerId);
      return;
    }
    const card = target.closest ? target.closest(".vnm-node") : null;
    moved = false;
    startX = ev.clientX;
    startY = ev.clientY;
    if (card && card.dataset.id) {
      mode = "drag";
      dragId = card.dataset.id;
      startPos = { x: positions[dragId].x, y: positions[dragId].y };
      card.style.cursor = "grabbing";
    } else {
      const w = pointerWorld(ev);
      const sgId = subgraphHit(w.x, w.y);
      if (sgId) {
        mode = "group";
        deselect();
        groupMembers = subgraphMembers[sgId] || [];
        groupStart = {};
        for (const id of groupMembers) groupStart[id] = { x: positions[id].x, y: positions[id].y };
      } else {
        mode = "pan";
        deselect();
        startTx = tx;
        startTy = ty;
        viewport.style.cursor = "grabbing";
      }
    }
    viewport.setPointerCapture(ev.pointerId);
  }
  function onPointerMove(ev) {
    if (mode === "none") return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) moved = true;
    if (mode === "pan") {
      tx = startTx + dx;
      ty = startTy + dy;
      applyTransform();
    } else if (mode === "drag" && dragId) {
      positions[dragId] = { x: startPos.x + dx / scale, y: startPos.y + dy / scale };
      positionCard(dragId);
      renderSubgraphs();
      renderEdges();
      if (dragId === selected) positionHandles();
      drawMinimap();
    } else if (mode === "resize" && resizeId) {
      const movX = rMovableX + dx / scale;
      const movY = rMovableY + dy / scale;
      const newW = Math.max(MIN_SIZE, rsx * (movX - rFixedX));
      const newH = Math.max(MIN_SIZE, rsy * (movY - rFixedY));
      sizes[resizeId] = { w: newW, h: newH };
      positions[resizeId] = { x: rFixedX + rsx * newW / 2, y: rFixedY + rsy * newH / 2 };
      applyCardSize(resizeId);
      positionCard(resizeId);
      renderSubgraphs();
      renderEdges();
      positionHandles();
      drawMinimap();
    } else if (mode === "group") {
      for (const id of groupMembers) {
        const s0 = groupStart[id];
        positions[id] = { x: s0.x + dx / scale, y: s0.y + dy / scale };
        positionCard(id);
      }
      renderSubgraphs();
      renderEdges();
      positionHandles();
      drawMinimap();
    } else if (mode === "anchor" && anchorEi >= 0) {
      const w = pointerWorld(ev);
      const p = positions[anchorNode];
      const s = sizes[anchorNode];
      const pin = anchorFromPointer({ x: p.x, y: p.y, w: s.w, h: s.h }, w.x, w.y);
      const cur = anchorsOv[anchorEi] || (anchorsOv[anchorEi] = {});
      cur[anchorEnd] = pin;
      renderEdges();
      drawMinimap();
    }
  }
  function onPointerUp(ev) {
    if (mode === "drag" && dragId) {
      cards[dragId].style.cursor = "grab";
      if (moved) schedulePersist();
      else selectNode(dragId);
    } else if (mode === "resize" && resizeId) {
      if (moved) schedulePersist();
    } else if (mode === "group") {
      if (moved) schedulePersist();
    } else if (mode === "anchor") {
      if (moved) schedulePersist();
    }
    viewport.style.cursor = "grab";
    try {
      viewport.releasePointerCapture(ev.pointerId);
    } catch {
    }
    mode = "none";
    dragId = null;
    resizeId = null;
    anchorEi = -1;
    groupMembers = [];
  }
  function onWheel(ev) {
    ev.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(cx, cy, clampScale(scale * factor));
  }
  function onMinimapDown(ev) {
    ev.stopPropagation();
    mode = "minimap";
    recenterFromMinimap(ev);
    minimap.setPointerCapture(ev.pointerId);
  }
  function onMinimapMove(ev) {
    if (mode === "minimap") recenterFromMinimap(ev);
  }
  function onMinimapUp(ev) {
    mode = "none";
    try {
      minimap.releasePointerCapture(ev.pointerId);
    } catch {
    }
  }
  function recenterFromMinimap(ev) {
    const rect = minimap.getBoundingClientRect();
    const s = Math.min(minimap.width / Math.max(contentW, 1), minimap.height / Math.max(contentH, 1));
    const worldX = (ev.clientX - rect.left) / s;
    const worldY = (ev.clientY - rect.top) / s;
    tx = viewport.clientWidth / 2 - worldX * scale;
    ty = viewport.clientHeight / 2 - worldY * scale;
    applyTransform();
  }
  let selected = null;
  function selectNode(id) {
    if (selected && cards[selected]) cards[selected].style.outline = "";
    selected = id;
    cards[id].style.outline = "2px solid var(--vnm-accent)";
    cards[id].style.outlineOffset = "2px";
    positionHandles();
    positionEdgeHandles(computePorts());
  }
  function deselect() {
    if (selected && cards[selected]) cards[selected].style.outline = "";
    selected = null;
    hideHandles();
    positionEdgeHandles(computePorts());
  }
  for (const id in cards) {
    const card = cards[id];
    card.addEventListener("pointerenter", () => {
      if (mode === "none") card.style.transform = "translateY(calc(-1 * var(--vnm-hover-lift)))";
    });
    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  }
  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("wheel", onWheel, { passive: false });
  if (minimap) {
    minimap.addEventListener("pointerdown", onMinimapDown);
    minimap.addEventListener("pointermove", onMinimapMove);
    minimap.addEventListener("pointerup", onMinimapUp);
  }
  let persistTimer = null;
  function schedulePersist() {
    if (!opt.persistKey) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 400);
  }
  function persistNow() {
    if (!opt.persistKey) return;
    try {
      win.localStorage.setItem(opt.persistKey, JSON.stringify(exportLayout()));
    } catch {
    }
  }
  function loadPersisted() {
    if (!opt.persistKey) return;
    try {
      const raw = win.localStorage.getItem(opt.persistKey);
      if (raw) importLayout(JSON.parse(raw));
    } catch {
    }
  }
  function resetLayout() {
    for (const nd of model.nodes) {
      positions[nd.id] = { x: nd.x - offsetX, y: nd.y - offsetY };
      sizes[nd.id] = { w: baseSizes[nd.id].w, h: baseSizes[nd.id].h };
    }
    for (const k in anchorsOv) delete anchorsOv[Number(k)];
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (opt.persistKey) {
      try {
        win.localStorage.removeItem(opt.persistKey);
      } catch {
      }
    }
    renderAll();
  }
  function exportLayout() {
    const pos = {};
    for (const id in positions) pos[id] = { x: positions[id].x + offsetX, y: positions[id].y + offsetY };
    const sz = {};
    for (const id in sizes) {
      const base = baseSizes[id];
      if (!base || sizes[id].w !== base.w || sizes[id].h !== base.h) {
        sz[id] = { w: sizes[id].w, h: sizes[id].h };
      }
    }
    const an = {};
    for (const k in anchorsOv) {
      const ov = anchorsOv[Number(k)];
      if (ov.source || ov.target) {
        const entry = {};
        if (ov.source) entry.source = { side: ov.source.side, offset: ov.source.offset };
        if (ov.target) entry.target = { side: ov.target.side, offset: ov.target.offset };
        const e = edgeEls[Number(k)];
        if (e) {
          entry.from = e.from;
          entry.to = e.to;
        }
        an[k] = entry;
      }
    }
    const out = { version: 1, positions: pos, transform: { x: tx, y: ty, scale } };
    if (Object.keys(sz).length) out.sizes = sz;
    if (Object.keys(an).length) out.anchors = an;
    return out;
  }
  function importLayout(data) {
    if (data && data.positions) {
      for (const id in data.positions) {
        if (positions[id]) positions[id] = { x: data.positions[id].x - offsetX, y: data.positions[id].y - offsetY };
      }
    }
    if (data && data.sizes) {
      for (const id in data.sizes) {
        if (sizes[id]) sizes[id] = { w: data.sizes[id].w, h: data.sizes[id].h };
      }
    }
    if (data && data.anchors) {
      const claimed = {};
      for (const k in data.anchors) {
        const src = data.anchors[k];
        const entry = {};
        if (src.source) entry.source = { side: src.source.side, offset: src.source.offset };
        if (src.target) entry.target = { side: src.target.side, offset: src.target.offset };
        if (!entry.source && !entry.target) continue;
        const idx = Number(k);
        const inRange = idx >= 0 && idx < edgeEls.length && Math.floor(idx) === idx;
        const hasId = src.from !== void 0 && src.to !== void 0;
        let ti = -1;
        if (inRange && (!hasId || edgeEls[idx].from === src.from && edgeEls[idx].to === src.to)) {
          ti = idx;
        } else if (hasId) {
          ti = edgeEls.findIndex((e, i) => !claimed[i] && e.from === src.from && e.to === src.to);
        }
        if (ti < 0 || claimed[ti]) continue;
        claimed[ti] = true;
        anchorsOv[ti] = entry;
      }
    }
    if (data && data.transform) {
      tx = data.transform.x;
      ty = data.transform.y;
      scale = data.transform.scale;
    }
    renderAll();
  }
  function setTheme(theme, cssVars) {
    tokens = theme.tokens;
    edgeStyle = theme.edgeStyle;
    viewport.setAttribute(
      "style",
      "position:absolute;inset:0;overflow:hidden;background:var(--vnm-bg);cursor:grab;touch-action:none;user-select:none;font-family:var(--vnm-font);" + cssVars
    );
    defs2.querySelector("marker path")?.setAttribute("fill", tokens.colors.edge);
    for (const nd of model.nodes) {
      const st = styleForNode(nd.id, nd.classes, nd.style);
      cards[nd.id].setAttribute("style", cardStyle(nd.id, st));
      const els = nodeShapeEls[nd.id];
      if (els) {
        els.fill.setAttribute("fill", st.fill);
        const sw = st.strokeWidth ?? "1.5";
        for (const p of els.strokes) {
          p.setAttribute("stroke", st.stroke);
          p.setAttribute("stroke-width", sw);
        }
      }
      const markers = stateMarkerEls[nd.id];
      if (markers) {
        for (const c of markers) {
          if (c.getAttribute("fill") === "none") c.setAttribute("stroke", tokens.colors.text);
          else c.setAttribute("fill", tokens.colors.text);
        }
      }
    }
    renderAll();
  }
  function destroy() {
    viewport.removeEventListener("pointerdown", onPointerDown);
    viewport.removeEventListener("pointermove", onPointerMove);
    viewport.removeEventListener("pointerup", onPointerUp);
    viewport.removeEventListener("wheel", onWheel);
    if (persistTimer) clearTimeout(persistTimer);
    root.removeChild(viewport);
  }
  function xmlEsc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function xmlAttr(s) {
    return xmlEsc(s).replace(/"/g, "&quot;");
  }
  function absBox(id) {
    const p = positions[id];
    const s = sizes[id];
    return { x: p.x + offsetX, y: p.y + offsetY, w: s.w, h: s.h, shape: shapeById[id] };
  }
  function svgDefs() {
    const a = tokens.edge.arrowSize;
    const shadow = tokens.effects.gradient ? '<filter id="vnm-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.35"/></filter>' : "";
    const font = sketch && payload.sketch ? "<style>" + payload.sketch.fontFace + "</style>" : "";
    const semMarkers = semEdges ? SEMANTICS_T.map(
      (s) => '<marker id="' + semMarkerT(s) + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="' + a + '" markerHeight="' + a + '" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="' + semColorT(s) + '"/></marker>'
    ).join("") : "";
    return '<defs><marker id="vnm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="' + a + '" markerHeight="' + a + '" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="' + tokens.colors.edge + '"/></marker><marker id="vnm-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="' + a + '" markerHeight="' + a + '" orient="auto"><path d="M10 0 L0 5 L10 10 z" fill="' + tokens.colors.edge + '"/></marker>' + semMarkers + shadow + font + "</defs>";
  }
  function subgraphAbsBox(sg) {
    const ids = subgraphMembers[sg.id] || [];
    const boxes = ids.map(absBox);
    const b = sgBoxFrom(boxes, !!sg.title);
    return b ?? { x: sg.x, y: sg.y, w: sg.width, h: sg.height };
  }
  function svgSubgraphBox(sg) {
    const b = subgraphAbsBox(sg);
    const x = nAt(b.x - b.w / 2);
    const y = nAt(b.y - b.h / 2);
    return '<rect x="' + x + '" y="' + y + '" width="' + nAt(b.w) + '" height="' + nAt(b.h) + '" rx="' + tokens.radii.card + '" fill="' + tokens.colors.subgraphFill + '" stroke="' + tokens.colors.subgraphStroke + '" stroke-dasharray="4 4"/>';
  }
  function svgSubgraphTitle(sg) {
    if (!sg.title) return "";
    const b = subgraphAbsBox(sg);
    const x = nAt(b.x - b.w / 2);
    const y = nAt(b.y - b.h / 2);
    const fs = tokens.font.size - 1;
    const pad = 5;
    const pw = sg.title.length * fs * 0.6 + pad * 2;
    return '<rect x="' + nAt(x + 12 - pad) + '" y="' + nAt(y + 18 - fs + 1) + '" width="' + nAt(pw) + '" height="' + (fs + 4) + '" rx="' + tokens.radii.label + '" fill="' + tokens.colors.subgraphFill + '"/><text x="' + nAt(x + 12) + '" y="' + nAt(y + 18) + '" fill="' + tokens.colors.subgraphText + '" font-size="' + fs + '" font-weight="600">' + xmlEsc(sg.title) + "</text>";
  }
  function svgEdgeLabel(label, cx, cy) {
    const lines = label.split("\n");
    const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
    const w = maxChars * tokens.font.size * 0.6 + 6;
    const h = lines.length * tokens.font.lineHeight + 2;
    const x = nAt(cx - w / 2);
    const y = nAt(cy - h / 2);
    let out = '<rect x="' + x + '" y="' + y + '" width="' + nAt(w) + '" height="' + nAt(h) + '" rx="' + tokens.radii.label + '" fill="' + tokens.colors.edgeLabelBg + '"/>';
    const startY2 = cy - (lines.length - 1) * tokens.font.lineHeight / 2;
    lines.forEach((line, i) => {
      out += '<text x="' + nAt(cx) + '" y="' + nAt(startY2 + i * tokens.font.lineHeight) + '" fill="' + tokens.colors.edgeLabelText + '" font-size="' + (tokens.font.size - 1) + '" text-anchor="middle" dominant-baseline="central">' + xmlEsc(line) + "</text>";
    });
    return out;
  }
  function svgEdge(e, path, points) {
    const width = e.kind === "thick" ? tokens.edge.thickWidth : tokens.edge.width;
    const dash = e.kind === "dotted" ? ' stroke-dasharray="2 5"' : "";
    const ec = edgeColorT(e.kind, e.label ?? "");
    let out;
    if (sketch) {
      const key = e.from + "->" + e.to;
      const arr = points.map((p) => [p.x, p.y]);
      const base = ' fill="none" stroke="' + ec.color + '" stroke-width="' + width + '" stroke-linejoin="round" stroke-linecap="round"';
      const lineStroke = base + dash;
      let s = "";
      for (const d of roughPolyline2(arr, key)) s += '<path d="' + d + '"' + lineStroke + "/>";
      const m = arr.length;
      if (e.arrows.end && m >= 2)
        s += '<path d="' + openArrowhead2(arr[m - 1], arr[m - 2], tokens.edge.arrowSize, key + "@end") + '"' + base + "/>";
      if (e.arrows.start && m >= 2)
        s += '<path d="' + openArrowhead2(arr[0], arr[1], tokens.edge.arrowSize, key + "@start") + '"' + base + "/>";
      out = s;
    } else {
      const mEnd = e.arrows.end ? ' marker-end="url(#' + ec.marker + ')"' : "";
      const mStart = e.arrows.start ? ' marker-start="url(#vnm-arrow-start)"' : "";
      out = '<path d="' + path + '" fill="none" stroke="' + ec.color + '" stroke-width="' + width + '" stroke-linejoin="round" stroke-linecap="round"' + dash + mStart + mEnd + "/>";
    }
    return out;
  }
  function svgEdgeArrowCap(e, points) {
    const m = points.length;
    if (m < 2 || !e.arrows.end && !e.arrows.start) return "";
    const width = e.kind === "thick" ? tokens.edge.thickWidth : tokens.edge.width;
    const ec = edgeColorT(e.kind, e.label ?? "");
    if (sketch) {
      const key = e.from + "->" + e.to;
      const arr = points.map((p) => [p.x, p.y]);
      const base = ' fill="none" stroke="' + ec.color + '" stroke-width="' + width + '" stroke-linejoin="round" stroke-linecap="round"';
      let s2 = "";
      if (e.arrows.end) s2 += '<path class="vnm-arrow-cap" d="' + openArrowhead2(arr[m - 1], arr[m - 2], tokens.edge.arrowSize, key + "@end") + '"' + base + "/>";
      if (e.arrows.start) s2 += '<path class="vnm-arrow-cap" d="' + openArrowhead2(arr[0], arr[1], tokens.edge.arrowSize, key + "@start") + '"' + base + "/>";
      return s2;
    }
    let s = "";
    if (e.arrows.end) s += svgCapEnd(points[m - 2], points[m - 1], width, ec.color, ec.marker);
    if (e.arrows.start) s += svgCapStart(points[0], points[1], width, ec.color);
    return s;
  }
  function svgCapEnd(prev, tip, width, color, marker) {
    const dx = tip.x - prev.x;
    const dy = tip.y - prev.y;
    const mag = Math.hypot(dx, dy) || 1;
    const len = Math.min(tokens.edge.arrowSize + 4, mag);
    const bx = tip.x - dx / mag * len;
    const by = tip.y - dy / mag * len;
    return '<path class="vnm-arrow-cap" d="M ' + nAt(bx) + " " + nAt(by) + " L " + nAt(tip.x) + " " + nAt(tip.y) + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round" marker-end="url(#' + marker + ')"/>';
  }
  function svgCapStart(head, next, width, color) {
    const dx = next.x - head.x;
    const dy = next.y - head.y;
    const mag = Math.hypot(dx, dy) || 1;
    const len = Math.min(tokens.edge.arrowSize + 4, mag);
    const bx = head.x + dx / mag * len;
    const by = head.y + dy / mag * len;
    return '<path class="vnm-arrow-cap" d="M ' + nAt(head.x) + " " + nAt(head.y) + " L " + nAt(bx) + " " + nAt(by) + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round" marker-start="url(#vnm-arrow-start)"/>';
  }
  function svgPolygon(pts, common) {
    return '<polygon points="' + pts.map((p) => nAt(p[0]) + "," + nAt(p[1])).join(" ") + '" ' + common + "/>";
  }
  function svgShape(shape, box, fill, stroke, sw, dash, key) {
    const x = box.x - box.w / 2;
    const y = box.y - box.h / 2;
    const w = box.w;
    const h = box.h;
    const cx = box.x;
    const cy = box.y;
    if (sketch) {
      const sp = sketchShapePoints(shape, x, y, w, h);
      const rs = roughShape2(sp.pts, key);
      const strokeAttr = ' fill="none" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round"' + dash;
      let out = '<path d="' + rs.fill + '" fill="' + fill + '" stroke="none"/>';
      for (const d of rs.outline) out += '<path d="' + d + '"' + strokeAttr + "/>";
      sp.extras.forEach((seg, i) => {
        for (const d of roughPolyline2(seg, key + "#x" + i)) out += '<path d="' + d + '"' + strokeAttr + "/>";
      });
      return out;
    }
    const common = 'fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + dash;
    const rect = (rx) => '<rect x="' + nAt(x) + '" y="' + nAt(y) + '" width="' + nAt(w) + '" height="' + nAt(h) + '" rx="' + rx + '" ' + common + "/>";
    if (shape === "rounded") return rect(14);
    if (shape === "stadium") return rect(nAt(h / 2));
    if (shape === "subroutine") {
      const inset = 6;
      return rect(4) + '<line x1="' + nAt(x + inset) + '" y1="' + nAt(y) + '" x2="' + nAt(x + inset) + '" y2="' + nAt(y + h) + '" stroke="' + stroke + '" stroke-width="' + sw + '"/><line x1="' + nAt(x + w - inset) + '" y1="' + nAt(y) + '" x2="' + nAt(x + w - inset) + '" y2="' + nAt(y + h) + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
    }
    if (shape === "circle")
      return '<ellipse cx="' + nAt(cx) + '" cy="' + nAt(cy) + '" rx="' + nAt(w / 2) + '" ry="' + nAt(h / 2) + '" ' + common + "/>";
    if (shape === "diamond")
      return svgPolygon([[cx, y], [x + w, cy], [cx, y + h], [x, cy]], common);
    if (shape === "hexagon") {
      const k = Math.min(w * 0.22, h * 0.5);
      return svgPolygon([[x + k, y], [x + w - k, y], [x + w, cy], [x + w - k, y + h], [x + k, y + h], [x, cy]], common);
    }
    if (shape === "parallelogram") {
      const k = Math.min(w * 0.22, h);
      return svgPolygon([[x + k, y], [x + w, y], [x + w - k, y + h], [x, y + h]], common);
    }
    if (shape === "parallelogram-alt") {
      const k = Math.min(w * 0.22, h);
      return svgPolygon([[x, y], [x + w - k, y], [x + w, y + h], [x + k, y + h]], common);
    }
    if (shape === "cylinder") {
      const ry = Math.min(10, h * 0.18);
      const top = y + ry;
      const bottom = y + h - ry;
      const d = "M " + nAt(x) + " " + nAt(top) + " C " + nAt(x) + " " + nAt(top - ry * 1.3) + " " + nAt(x + w) + " " + nAt(top - ry * 1.3) + " " + nAt(x + w) + " " + nAt(top) + " L " + nAt(x + w) + " " + nAt(bottom) + " C " + nAt(x + w) + " " + nAt(bottom + ry * 1.3) + " " + nAt(x) + " " + nAt(bottom + ry * 1.3) + " " + nAt(x) + " " + nAt(bottom) + " Z";
      const lid = "M " + nAt(x) + " " + nAt(top) + " C " + nAt(x) + " " + nAt(top + ry * 1.3) + " " + nAt(x + w) + " " + nAt(top + ry * 1.3) + " " + nAt(x + w) + " " + nAt(top);
      return '<path d="' + d + '" ' + common + '/><path d="' + lid + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
    }
    return rect(6);
  }
  function svgNodeText(node, box, color) {
    const lines = node.label.length ? node.label.split("\n") : [""];
    const startY2 = box.y - (lines.length - 1) * tokens.font.lineHeight / 2;
    return lines.map(
      (line, i) => '<text x="' + nAt(box.x) + '" y="' + nAt(startY2 + i * tokens.font.lineHeight) + '" fill="' + color + '" font-size="' + tokens.font.size + '" font-weight="' + tokens.font.weight + '" text-anchor="middle" dominant-baseline="central">' + xmlEsc(line) + "</text>"
    ).join("");
  }
  function svgNode(node) {
    if (sketch && node.stateMarker) {
      const b = absBox(node.id);
      const r = Math.min(9, b.w / 2);
      const cx = nAt(b.x);
      const cy = nAt(b.y);
      const col = tokens.colors.text;
      if (node.stateMarker === "start") {
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + nAt(r) + '" fill="' + col + '"/>';
      }
      return '<circle cx="' + cx + '" cy="' + cy + '" r="' + nAt(r) + '" fill="none" stroke="' + col + '" stroke-width="1.5"/><circle cx="' + cx + '" cy="' + cy + '" r="' + nAt(r - 4) + '" fill="' + col + '"/>';
    }
    const box = absBox(node.id);
    const st = styleForNode(node.id, node.classes, node.style);
    const shadow = tokens.effects.gradient && !sketch ? ' filter="url(#vnm-shadow)"' : "";
    const sw = xmlAttr(st.strokeWidth ?? "1.5");
    const dash = st.strokeDasharray ? ' stroke-dasharray="' + xmlAttr(st.strokeDasharray) + '"' : "";
    const shape = svgShape(node.shape, box, xmlAttr(st.fill), xmlAttr(st.stroke), sw, dash, node.id);
    const text = svgNodeText(node, box, xmlAttr(st.text));
    return "<g" + shadow + ">" + shape + text + "</g>";
  }
  function boundsAbs(boxes, pts) {
    const pad = 20;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.x - b.w / 2);
      minY = Math.min(minY, b.y - b.h / 2);
      maxX = Math.max(maxX, b.x + b.w / 2);
      maxY = Math.max(maxY, b.y + b.h / 2);
    }
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
    return {
      x: nAt(minX - pad),
      y: nAt(minY - pad),
      width: nAt(maxX - minX + pad * 2),
      height: nAt(maxY - minY + pad * 2)
    };
  }
  function usedSemanticsT() {
    const seen = {};
    for (const e of edgeEls) {
      const s = flowSemT(e.kind, e.label ?? "");
      if (s) seen[s] = true;
    }
    return SEMANTICS_T.filter((s) => seen[s]);
  }
  function svgEdgeLegend(legend, x0, y) {
    const fs = tokens.font.size - 2;
    const swatch = 22;
    let x = x0;
    let out = "";
    for (const sem of legend) {
      const color = semColorT(sem);
      out += '<line x1="' + nAt(x) + '" y1="' + nAt(y) + '" x2="' + nAt(x + swatch) + '" y2="' + nAt(y) + '" stroke="' + color + '" stroke-width="' + tokens.edge.width + '" stroke-linecap="round" marker-end="url(#' + semMarkerT(sem) + ')"/>';
      const label = SEMANTIC_LABEL_T[sem];
      out += '<text x="' + nAt(x + swatch + 6) + '" y="' + nAt(y) + '" fill="' + tokens.colors.subgraphText + '" font-size="' + fs + '" dominant-baseline="central">' + xmlEsc(label) + "</text>";
      x += swatch + 6 + label.length * fs * 0.6 + 24;
    }
    return "<g>" + out + "</g>";
  }
  function buildSvg() {
    const ports = computePorts();
    const boxes = [];
    for (const sg of model.subgraphs) boxes.push(subgraphAbsBox(sg));
    for (const nd of model.nodes) boxes.push(absBox(nd.id));
    const edgePathParts = [];
    const edgeLabelParts = [];
    const edgeArrowCapParts = [];
    const allPts = [];
    const routesB = edgeEls.map((e, i) => {
      const wps = e.waypoints ? e.waypoints.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })) : void 0;
      return routeBoxes(absBox(e.from), absBox(e.to), wps, ports[i], e.from === e.to);
    });
    avoidSubgraphs2(routesB, edgeEls, avoidContainersFrom(subgraphAbsBox));
    const nabB = avoidNodeBoxes((id) => {
      const b2 = absBox(id);
      return { x: b2.x, y: b2.y, w: b2.w, h: b2.h };
    });
    trimEndpointReentry2(routesB, edgeEls, nabB);
    for (let k = 0; k < NODE_AVOID_PASSES2; k++) {
      avoidNodes2(routesB, edgeEls, nabB);
      detourApproaches2(routesB, edgeEls, nabB);
    }
    foldLabelShifts(routesB, resolveLabelLineOffsets2(labelPlatesOf(routesB), routesB.map((r) => r.points)));
    separateLanes2(routesB);
    separateAntiParallelJogs2(routesB, edgeEls);
    separateConvergentJogs2(routesB, edgeEls);
    foldLabelShifts(routesB, resolveLabelCollisions2(labelPlatesOf(routesB)));
    foldLabelShifts(routesB, resolveLabelEdgeCollisions2(labelPlatesOf(routesB), routesB.map((r) => r.points)));
    const nodeBoxesB = model.nodes.map((nd) => {
      const b2 = absBox(nd.id);
      return { x: b2.x, y: b2.y, w: b2.w, h: b2.h };
    });
    foldLabelShifts(routesB, resolveLabelNodeCollisions2(labelPlatesOf(routesB), nodeBoxesB));
    foldLabelShifts(routesB, resolveLabelCollisions2(labelPlatesOf(routesB)));
    const bridgedB = applyEdgeBridges2(routesB.map((r) => r.points), bridgesEnabled());
    edgeEls.forEach((e, i) => {
      const r = routesB[i];
      for (const p of r.points) allPts.push(p);
      edgePathParts.push(svgEdge(e, bridgedB[i] ?? r.path, r.points));
      if (arrowCaps) edgeArrowCapParts.push(svgEdgeArrowCap(e, r.points));
      if (e.label) {
        edgeLabelParts.push(svgEdgeLabel(e.label, r.labelPos.x, r.labelPos.y));
      }
    });
    for (const pl of labelPlatesOf(routesB)) {
      if (pl) allPts.push({ x: pl.x - pl.w / 2, y: pl.y - pl.h / 2 }, { x: pl.x + pl.w / 2, y: pl.y + pl.h / 2 });
    }
    const b = boundsAbs(boxes, allPts);
    const legend = semEdges ? usedSemanticsT() : [];
    const legendH = legend.length ? tokens.font.lineHeight + 20 : 0;
    const totalH = b.height + legendH;
    const parts = [];
    parts.push(
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + nAt(b.width) + '" height="' + nAt(totalH) + '" viewBox="' + nAt(b.x) + " " + nAt(b.y) + " " + nAt(b.width) + " " + nAt(totalH) + '" font-family="' + xmlAttr(sketch && payload.sketch ? payload.sketch.fontFamily : tokens.font.family) + '">'
    );
    parts.push(svgDefs());
    parts.push(
      '<rect x="' + nAt(b.x) + '" y="' + nAt(b.y) + '" width="' + nAt(b.width) + '" height="' + nAt(totalH) + '" fill="' + tokens.colors.background + '"/>'
    );
    for (const sg of model.subgraphs) parts.push(svgSubgraphBox(sg));
    for (const ep of edgePathParts) parts.push(ep);
    for (const lp of edgeLabelParts) parts.push(lp);
    for (const sg of model.subgraphs) parts.push(svgSubgraphTitle(sg));
    for (const nd of model.nodes) parts.push(svgNode(nd));
    for (const cap of edgeArrowCapParts) parts.push(cap);
    if (legend.length) parts.push(svgEdgeLegend(legend, b.x + 16, b.y + b.height + legendH / 2));
    parts.push("</svg>");
    return { svg: parts.join("\n"), width: b.width, height: totalH };
  }
  function toSvgString() {
    return buildSvg().svg;
  }
  function exportFileBase() {
    const t = (doc.title || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return t || "diagram";
  }
  function triggerDownload(href, filename) {
    const a = doc.createElement("a");
    a.setAttribute("href", href);
    a.setAttribute("download", filename);
    a.style.display = "none";
    if (doc.body) doc.body.appendChild(a);
    a.click();
    if (doc.body && a.parentNode) doc.body.removeChild(a);
  }
  function saveSvg() {
    const href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(toSvgString());
    triggerDownload(href, exportFileBase() + ".svg");
  }
  function savePng() {
    const built = buildSvg();
    const dpr = win.devicePixelRatio || 1;
    const scale2 = Math.max(1, Math.min(3, dpr * 1.5));
    const w = Math.max(1, Math.round(built.width * scale2));
    const h = Math.max(1, Math.round(built.height * scale2));
    const fail = (msg) => {
      const c = win.console;
      if (c && c.error) c.error("[very-nice-mermaid] " + msg);
    };
    const img = doc.createElement("img");
    img.onload = () => {
      const canvas = doc.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        fail("PNG export failed: 2D canvas context is unavailable");
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL("image/png");
      } catch (err) {
        fail("PNG export failed while encoding the canvas: " + err);
        return;
      }
      triggerDownload(dataUrl, exportFileBase() + ".png");
    };
    img.onerror = () => fail("PNG export failed: the diagram SVG could not be loaded for rasterizing");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(built.svg);
  }
  loadPersisted();
  renderAll();
  if (viewport.clientWidth === 0) {
    win.requestAnimationFrame(() => fit());
  } else {
    fit();
  }
  const ROCtor = win.ResizeObserver;
  if (ROCtor) new ROCtor(() => drawMinimap()).observe(viewport);
  return {
    root,
    destroy,
    fit,
    zoomIn: () => zoomBy(1.2),
    zoomOut: () => zoomBy(1 / 1.2),
    resetView,
    resetLayout,
    exportLayout,
    importLayout,
    setTheme,
    getPositions: () => exportLayout().positions,
    toSvgString
  };
}

// src/render/sketch-font.ts
var SKETCH_FONT_NAME = "Kalam";
var SKETCH_FONT_FAMILY = "'Kalam', 'Comic Sans MS', 'Segoe Print', 'Bradley Hand', cursive";
var SKETCH_FONT_MIME = "font/woff2";
var SKETCH_FONT_BASE64 = "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";
function sketchFontFaceCss() {
  return "@font-face{font-family:'" + SKETCH_FONT_NAME + "';font-style:normal;font-weight:400;src:url(data:" + SKETCH_FONT_MIME + ";base64," + SKETCH_FONT_BASE64 + ") format('woff2');}";
}

// src/render/dom/payload.ts
function hash(input) {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h << 5) + h + input.charCodeAt(i) >>> 0;
  return h.toString(36);
}
function persistKey(persist, model) {
  if (persist === false) return null;
  if (typeof persist === "string") return persist;
  const sig = model.nodes.map((nnode) => nnode.id).join(",") + "|" + model.direction;
  return "vnm-layout:" + hash(sig);
}
function buildPayload(model, theme, opts = {}) {
  const sketch = opts.style === "sketch";
  const cssVars = sketch ? theme.cssVars() + `--vnm-font: ${SKETCH_FONT_FAMILY};` : theme.cssVars();
  const payload = {
    model: serializeModel(model),
    theme: { name: theme.name, edgeStyle: theme.edgeStyle, tokens: theme.tokens },
    cssVars,
    options: {
      fitPadding: opts.fitPadding ?? theme.tokens.spacing.fitPadding,
      persistKey: persistKey(opts.persist, model),
      minimap: opts.minimap ?? true,
      minScale: opts.minScale ?? 0.2,
      maxScale: opts.maxScale ?? 4,
      style: sketch ? "sketch" : "clean",
      bridges: opts.bridges,
      arrowCaps: opts.arrowCaps ?? true
    }
  };
  if (sketch) payload.sketch = { fontFace: sketchFontFaceCss(), fontFamily: SKETCH_FONT_FAMILY };
  return payload;
}

// src/render/dom/seq-runtime.ts
function seqRuntime(root, payload) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const opt = payload.options;
  const contentW = payload.content.width;
  const contentH = payload.content.height;
  let tx = 0;
  let ty = 0;
  let scale = 1;
  root.classList.add("vnm-root");
  const viewport = doc.createElement("div");
  viewport.className = "vnm-viewport";
  viewport.setAttribute(
    "style",
    "position:absolute;inset:0;overflow:hidden;background:var(--vnm-bg);cursor:grab;touch-action:none;user-select:none;font-family:var(--vnm-font);" + payload.cssVars
  );
  if (getComputedStyle(root).position === "static") root.style.position = "relative";
  root.appendChild(viewport);
  const world = doc.createElement("div");
  world.className = "vnm-world";
  world.setAttribute(
    "style",
    "position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;"
  );
  world.innerHTML = payload.svg;
  viewport.appendChild(world);
  let minimap = null;
  if (opt.minimap) {
    minimap = doc.createElement("canvas");
    minimap.className = "vnm-minimap";
    minimap.width = 180;
    minimap.height = Math.max(80, Math.round(180 * contentH / Math.max(contentW, 1)));
    minimap.setAttribute(
      "style",
      "position:absolute;right:12px;bottom:12px;border:1px solid var(--vnm-surface-stroke);border-radius:8px;background:var(--vnm-minimap-bg);cursor:pointer;box-shadow:var(--vnm-node-shadow);"
    );
    viewport.appendChild(minimap);
  }
  const toolbar = doc.createElement("div");
  toolbar.className = "vnm-toolbar";
  toolbar.setAttribute("style", "position:absolute;left:12px;top:12px;display:flex;gap:6px;");
  const mkBtn = (label, title, on) => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute(
      "style",
      "width:28px;height:28px;border:1px solid var(--vnm-surface-stroke);border-radius:6px;background:var(--vnm-surface);color:var(--vnm-text);cursor:pointer;font-size:15px;line-height:1;"
    );
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      on();
    });
    toolbar.appendChild(btn);
    return btn;
  };
  mkBtn("\u2922", "Fit to view", () => fit());
  mkBtn("+", "Zoom in", () => zoomBy(1.2));
  mkBtn("\u2212", "Zoom out", () => zoomBy(1 / 1.2));
  viewport.appendChild(toolbar);
  function clampScale(v) {
    return Math.max(opt.minScale, Math.min(opt.maxScale, v));
  }
  function applyTransform() {
    world.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
    drawMinimap();
  }
  function fit() {
    const vw = viewport.clientWidth || 800;
    const vh = viewport.clientHeight || 600;
    const pad = opt.fitPadding;
    const s = clampScale(
      Math.min((vw - pad * 2) / Math.max(contentW, 1), (vh - pad * 2) / Math.max(contentH, 1))
    );
    scale = s;
    tx = (vw - contentW * s) / 2;
    ty = (vh - contentH * s) / 2;
    applyTransform();
  }
  function zoomAt(cx, cy, next) {
    const wx = (cx - tx) / scale;
    const wy = (cy - ty) / scale;
    scale = next;
    tx = cx - wx * scale;
    ty = cy - wy * scale;
    applyTransform();
  }
  function zoomBy(factor) {
    zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, clampScale(scale * factor));
  }
  function resetView() {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  }
  function drawMinimap() {
    if (!minimap) return;
    const ctx = minimap.getContext("2d");
    if (!ctx) return;
    const mw = minimap.width;
    const mh = minimap.height;
    ctx.clearRect(0, 0, mw, mh);
    const s = Math.min(mw / Math.max(contentW, 1), mh / Math.max(contentH, 1));
    ctx.save();
    ctx.scale(s, s);
    ctx.strokeStyle = payload.minimap.accent;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45;
    for (const y of payload.minimap.lines) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(contentW, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = payload.minimap.accent;
    for (const box of payload.minimap.boxes) ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.restore();
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const vx = -tx / scale * s;
    const vy = -ty / scale * s;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = payload.minimap.accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw / scale * s, vh / scale * s);
    ctx.fillStyle = payload.minimap.viewport;
    ctx.fillRect(vx, vy, vw / scale * s, vh / scale * s);
  }
  let mode = "none";
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;
  function onPointerDown(ev) {
    const target = ev.target;
    if (target.closest && target.closest(".vnm-toolbar")) return;
    mode = "pan";
    startX = ev.clientX;
    startY = ev.clientY;
    startTx = tx;
    startTy = ty;
    viewport.style.cursor = "grabbing";
    viewport.setPointerCapture(ev.pointerId);
  }
  function onPointerMove(ev) {
    if (mode !== "pan") return;
    tx = startTx + (ev.clientX - startX);
    ty = startTy + (ev.clientY - startY);
    applyTransform();
  }
  function onPointerUp(ev) {
    viewport.style.cursor = "grab";
    try {
      viewport.releasePointerCapture(ev.pointerId);
    } catch {
    }
    mode = "none";
  }
  function onWheel(ev) {
    ev.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(cx, cy, clampScale(scale * factor));
  }
  function recenterFromMinimap(ev) {
    const rect = minimap.getBoundingClientRect();
    const s = Math.min(minimap.width / Math.max(contentW, 1), minimap.height / Math.max(contentH, 1));
    const worldX = (ev.clientX - rect.left) / s;
    const worldY = (ev.clientY - rect.top) / s;
    tx = viewport.clientWidth / 2 - worldX * scale;
    ty = viewport.clientHeight / 2 - worldY * scale;
    applyTransform();
  }
  function onMinimapDown(ev) {
    ev.stopPropagation();
    mode = "minimap";
    recenterFromMinimap(ev);
    minimap.setPointerCapture(ev.pointerId);
  }
  function onMinimapMove(ev) {
    if (mode === "minimap") recenterFromMinimap(ev);
  }
  function onMinimapUp(ev) {
    mode = "none";
    try {
      minimap.releasePointerCapture(ev.pointerId);
    } catch {
    }
  }
  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("wheel", onWheel, { passive: false });
  if (minimap) {
    minimap.addEventListener("pointerdown", onMinimapDown);
    minimap.addEventListener("pointermove", onMinimapMove);
    minimap.addEventListener("pointerup", onMinimapUp);
  }
  function destroy() {
    viewport.removeEventListener("pointerdown", onPointerDown);
    viewport.removeEventListener("pointermove", onPointerMove);
    viewport.removeEventListener("pointerup", onPointerUp);
    viewport.removeEventListener("wheel", onWheel);
    root.removeChild(viewport);
  }
  if (viewport.clientWidth === 0) win.requestAnimationFrame(() => fit());
  else fit();
  const ROCtor = win.ResizeObserver;
  if (ROCtor) new ROCtor(() => drawMinimap()).observe(viewport);
  return {
    root,
    destroy,
    fit,
    zoomIn: () => zoomBy(1.2),
    zoomOut: () => zoomBy(1 / 1.2),
    resetView
  };
}

// src/model/class.ts
function isClassLayout(value) {
  return typeof value === "object" && value !== null && value.kind === "class-layout";
}

// src/model/state.ts
function isStateLayout(value) {
  return typeof value === "object" && value !== null && value.kind === "state-layout";
}

// src/model/sequence.ts
function isSequenceLayout(value) {
  return typeof value === "object" && value !== null && value.kind === "sequence-layout";
}

// src/diagnostics/index.ts
var Diagnostics = class {
  items = [];
  /** Record a diagnostic and return it. */
  emit(d) {
    this.items.push(d);
    return d;
  }
  /** A diagram took the mermaid.js fallback tier. Info-level (expected, not a loss). */
  fallbackTier(detectedType, message) {
    return this.emit({
      code: "fallback-tier",
      severity: "info",
      tier: "fallback",
      reason: detectedType,
      message: message ?? `'${detectedType}' rendered via the mermaid.js fallback engine (no native renderer)`
    });
  }
  /** A requested capability isn't available for this tier (e.g. ASCII for a pie). */
  capabilityUnavailable(capability, tier, message) {
    return this.emit({
      code: "capability-unavailable",
      severity: "warn",
      tier,
      capability,
      message
    });
  }
  /** An output degraded (e.g. mermaid geometry is unreliable under jsdom). */
  degraded(capability, reason, message) {
    return this.emit({
      code: "render-degraded",
      severity: "warn",
      tier: "fallback",
      capability,
      reason,
      message
    });
  }
  /**
   * The fallback engine produced a **degenerate/blank** artifact headless — a
   * zero/negative-width viewBox, negative-dimension rects, or empty content — so
   * there is no usable output at all (D9-A: honest failure, not a broken SVG
   * baked to disk). error-level; the CLI exits non-zero and writes nothing. The
   * diagram renders correctly in a real browser / the library.
   */
  fallbackUnavailable(reason, message) {
    return this.emit({
      code: "fallback-render-unavailable",
      severity: "error",
      tier: "fallback",
      reason,
      message
    });
  }
  /**
   * A theme token failed the style allowlist and was dropped/replaced before
   * reaching mermaid's `themeVariables` (FR5/FR7). warn-level: the render still
   * succeeds, but the requested styling was not applied verbatim.
   */
  unsafeThemeValue(token, message) {
    return this.emit({
      code: "unsafe-theme-value",
      severity: "warn",
      capability: "theme",
      reason: token,
      message
    });
  }
  /** A tier could not produce any output at all (hard failure). */
  failed(reason, message) {
    return this.emit({
      code: "render-failed",
      severity: "error",
      tier: "fallback",
      reason,
      message
    });
  }
  /** All diagnostics, in emission order. */
  all() {
    return this.items;
  }
  /** Is there at least one diagnostic at or above `warn`? (Drives `--strict`.) */
  hasLoss() {
    return this.items.some((d) => d.severity === "warn" || d.severity === "error");
  }
  /** Is there at least one `error`-level diagnostic? */
  hasError() {
    return this.items.some((d) => d.severity === "error");
  }
};

// src/mermaid/theme-map.ts
var FALLBACK_FONT_FAMILY = "sans-serif";
function toMermaidTheme(theme, diagnostics) {
  const c = theme.tokens.colors;
  const accent = c.roles.accent?.fill ?? c.accent;
  const accentStroke = c.roles.accent?.stroke ?? c.surfaceStroke;
  const themeVariables = {};
  const putColor = (mermaidKey, token, value) => {
    if (isSafeColor(value)) {
      themeVariables[mermaidKey] = value;
      return;
    }
    diagnostics?.unsafeThemeValue(
      token,
      `theme color '${token}' ('${value}') is not a safe CSS color and was dropped before mermaid themeVariables`
    );
  };
  putColor("background", "colors.background", c.background);
  putColor("primaryColor", "colors.surface", c.surface);
  putColor("mainBkg", "colors.surface", c.surface);
  putColor("primaryBorderColor", "colors.surfaceStroke", c.surfaceStroke);
  putColor("nodeBorder", "colors.surfaceStroke", c.surfaceStroke);
  putColor("primaryTextColor", "colors.text", c.text);
  putColor("textColor", "colors.text", c.text);
  putColor("lineColor", "colors.edge", c.edge);
  putColor("secondaryColor", "colors.subgraphFill", c.subgraphFill);
  putColor("secondaryBorderColor", "colors.subgraphStroke", c.subgraphStroke);
  putColor("secondaryTextColor", "colors.subgraphText", c.subgraphText);
  putColor("tertiaryColor", "colors.accent", accent);
  putColor("tertiaryBorderColor", "colors.accentStroke", accentStroke);
  putColor("edgeLabelBackground", "colors.edgeLabelBg", c.edgeLabelBg);
  const safeFamily = sanitizeFontFamily(theme.tokens.font.family);
  const fontFamily = safeFamily ?? FALLBACK_FONT_FAMILY;
  if (safeFamily === null) {
    diagnostics?.unsafeThemeValue(
      "font.family",
      `theme font.family ('${theme.tokens.font.family}') is not a safe font name and was replaced with '${FALLBACK_FONT_FAMILY}'`
    );
  }
  themeVariables.fontFamily = fontFamily;
  const safeSize = sanitizeFontSize(theme.tokens.font.size);
  if (safeSize !== null) {
    themeVariables.fontSize = safeSize;
  } else {
    diagnostics?.unsafeThemeValue(
      "font.size",
      `theme font.size ('${String(theme.tokens.font.size)}') is not a valid size and was dropped before mermaid themeVariables`
    );
  }
  return { theme: "base", fontFamily, themeVariables };
}

// src/mermaid/fallback.ts
var RENDER_ID = "vnm-fallback";
var FallbackUnavailableError = class extends Error {
  constructor(detected, message) {
    super(message);
    this.detected = detected;
    this.name = "FallbackUnavailableError";
  }
  detected;
};
function isDegenerate(svg) {
  const m = /viewBox="\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*"/.exec(svg);
  if (m) {
    const w = parseFloat(m[3]);
    const h = parseFloat(m[4]);
    if (!(w > 0 && h > 0) || w > 8e3 || h > 8e3) return true;
  }
  if (/\b(?:width|height)="\s*-[\d.]/.test(svg)) return true;
  if (!/<(?:rect|path|circle|ellipse|line|polygon|text|g|foreignObject)\b/.test(svg)) return true;
  return false;
}
async function renderFallbackSvg(dsl, opts = {}) {
  const diagnostics = opts.diagnostics ?? new Diagnostics();
  const detected = opts.detected ?? "unknown";
  const mermaid = await loadMermaid();
  const headless = usedHeadlessDom();
  const themeConfig = opts.theme ? toMermaidTheme(opts.theme, diagnostics) : {};
  const config = {
    startOnLoad: false,
    securityLevel: "loose",
    deterministicIds: true,
    // SVG <text> labels (not HTML foreignObject): measurable under our jsdom
    // stubs, and cleaner to re-skin later. See spike-01.md.
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
    state: { htmlLabels: false },
    ...themeConfig
  };
  let svg;
  try {
    mermaid.initialize(config);
    const result = await mermaid.render(RENDER_ID, dsl);
    svg = result.svg;
  } catch (err) {
    diagnostics.failed(
      detected,
      `mermaid could not render '${detected}' headless (${err.message}); this type needs a browser`
    );
    throw new Error(
      `fallback render failed for '${detected}': ${err.message}`
    );
  }
  if (headless && isDegenerate(svg)) {
    const message = `'${detected}' cannot be rendered headlessly (jsdom): the layout is degenerate/blank. It renders correctly in a browser / the library; use those for '${detected}'.`;
    diagnostics.fallbackUnavailable(detected, message);
    throw new FallbackUnavailableError(detected, message);
  }
  return { svg, diagnostics: diagnostics.all(), degraded: false };
}

// src/native/sequence/read.ts
var READ_ID = "vnm-seq-read";
async function renderMermaidSvg(dsl) {
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    deterministicIds: true,
    // SVG <text>/<tspan> labels, not HTML <foreignObject> — measurable under our
    // jsdom stubs and clean to read. See spike-01.md.
    htmlLabels: false,
    sequence: { htmlLabels: false }
  });
  const { svg } = await mermaid.render(READ_ID, dsl);
  return svg;
}
function hasClass(el, token) {
  const cls = el.getAttribute("class");
  if (!cls) return false;
  return cls.split(/\s+/).includes(token);
}
function cleanLabel(raw) {
  return (raw ?? "").replace(/[​‌‍﻿]/g, "").trim();
}
function lifelineCenters(doc) {
  const centers = /* @__PURE__ */ new Map();
  for (const line of Array.from(doc.querySelectorAll('line[data-et="life-line"]'))) {
    const id = line.getAttribute("data-id");
    const x1 = parseFloat(line.getAttribute("x1") ?? "");
    if (id && Number.isFinite(x1)) centers.set(id, x1);
  }
  return centers;
}
function readParticipants(doc, centers) {
  const seen = /* @__PURE__ */ new Map();
  for (const g of Array.from(doc.querySelectorAll('[data-et="participant"]'))) {
    const id = g.getAttribute("data-id");
    if (!id || seen.has(id)) continue;
    const labelEl = g.querySelector("text");
    const label = (labelEl?.textContent ?? "").trim() || id;
    seen.set(id, label);
  }
  const participants = Array.from(seen, ([id, label]) => ({
    id,
    label,
    x: centers.get(id) ?? Number.POSITIVE_INFINITY
  }));
  participants.sort((a, b) => a.x - b.x);
  return participants.map((p, order) => ({ id: p.id, label: p.label, order }));
}
function readMessages(doc, ids) {
  const messages = [];
  const ys = [];
  let pendingLabel = "";
  let order = 0;
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    if (hasClass(el, "messageText")) {
      pendingLabel = cleanLabel(el.textContent);
      continue;
    }
    if (el.getAttribute("data-et") !== "message") continue;
    const from = el.getAttribute("data-from") ?? "";
    const to = el.getAttribute("data-to") ?? "";
    if (!ids.has(from) || !ids.has(to)) {
      pendingLabel = "";
      continue;
    }
    const kind = hasClass(el, "messageLine1") ? "dashed" : "solid";
    messages.push({
      from,
      to,
      label: pendingLabel,
      kind,
      arrowEnd: el.hasAttribute("marker-end"),
      self: from === to,
      order: order++
    });
    ys.push(messageY(el));
    pendingLabel = "";
  }
  return { messages, ys };
}
function messageY(el) {
  const y2 = parseFloat(el.getAttribute("y2") ?? "");
  if (Number.isFinite(y2)) return y2;
  const y1 = parseFloat(el.getAttribute("y1") ?? "");
  if (Number.isFinite(y1)) return y1;
  const m = (el.getAttribute("d") ?? "").match(/M\s*[\d.-]+[\s,]+([\d.-]+)/);
  return m ? parseFloat(m[1]) : Number.NaN;
}
function readActivations(doc, centers, ys) {
  const centerList = Array.from(centers.entries());
  const nearest2 = (x) => {
    let best = "";
    let bd = Number.POSITIVE_INFINITY;
    for (const [id, cx] of centerList) {
      const d = Math.abs(cx - x);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  };
  const orderAtY = (y) => {
    let bi = 0;
    let bd = Number.POSITIVE_INFINITY;
    ys.forEach((my, i) => {
      const d = Math.abs(my - y);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    return bi;
  };
  const raw = [];
  for (const rect of Array.from(doc.querySelectorAll('rect[class^="activation"]'))) {
    const x = parseFloat(rect.getAttribute("x") ?? "");
    const w = parseFloat(rect.getAttribute("width") ?? "");
    const y = parseFloat(rect.getAttribute("y") ?? "");
    const h = parseFloat(rect.getAttribute("height") ?? "");
    if (![x, w, y, h].every(Number.isFinite) || ys.length === 0) continue;
    const participant = nearest2(x + w / 2);
    if (!participant) continue;
    const startOrder = orderAtY(y);
    const endOrder = Math.max(startOrder, orderAtY(y + h));
    raw.push({ participant, startOrder, endOrder, depth: 0 });
  }
  for (const a of raw) {
    a.depth = raw.filter(
      (o) => o !== a && o.participant === a.participant && o.startOrder <= a.startOrder && o.endOrder >= a.endOrder && (o.startOrder < a.startOrder || o.endOrder > a.endOrder)
    ).length;
  }
  return raw;
}
async function readSequenceModel(dsl) {
  const svg = await renderMermaidSvg(dsl);
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const centers = lifelineCenters(doc);
  const participants = readParticipants(doc, centers);
  const ids = new Set(participants.map((p) => p.id));
  const { messages, ys } = readMessages(doc, ids);
  const activations = readActivations(doc, centers, ys);
  return { kind: "sequence", participants, messages, ...activations.length ? { activations } : {} };
}

// src/native/sequence/semantics.ts
function inferRole(label) {
  const s = label.toLowerCase();
  const rules = [
    ["database", /postgres|postgresql|mysql|mariadb|redis|mongo|cassandra|dynamo|sqlite|datastore|\bdb\b|database|\bcache\b/],
    ["messagebus", /kafka|rabbit|\bsqs\b|\bsns\b|pubsub|\bqueue\b|\btopic\b|\bbus\b|\bstream\b|\bnats\b|\bmq\b|eventbridge|broker/],
    ["security", /\bauth\b|oauth|\bjwt\b|\biam\b|vault|keycloak|identity|\blogin\b|\bsso\b|security|\btoken\b/],
    ["external", /\buser\b|customer|external|third[- ]?party|\b3rd\b|\bactor\b|browser|\bclient\b|visitor/],
    ["frontend", /\bweb\b|\bui\b|frontend|\bspa\b|mobile|\bapp\b|portal|dashboard/],
    ["cloud", /\bcdn\b|\bwaf\b|\bs3\b|cloudfront|nginx|proxy|ingress|load ?balancer|\blb\b|\bcloud\b/],
    ["backend", /\bapi\b|gateway|service|server|backend|worker|lambda|function|microservice|grpc|handler|orchestrat/]
  ];
  for (const [role, re] of rules) if (re.test(s)) return role;
  return void 0;
}
function typeLabel(label) {
  const role = inferRole(label);
  const s = label.toLowerCase();
  switch (role) {
    case "database":
      return /redis|memcache|\bcache\b/.test(s) ? "cache" : "store";
    case "backend":
      return /gateway/.test(s) ? "gateway" : /worker/.test(s) ? "worker" : "service";
    case "security":
      return "auth";
    case "messagebus":
      return "broker";
    case "frontend":
      return /browser/.test(s) ? "browser" : "client";
    case "cloud":
      return /cdn/.test(s) ? "cdn" : /waf/.test(s) ? "waf" : "edge";
    case "external":
      return "actor";
    default:
      return "";
  }
}
function messageSemantic(kind, label) {
  const s = label.toLowerCase();
  if (/error|fail|reject|denied|invalid|exception|timeout|unauthor|\b40[13]\b|\b500\b|refus/.test(s)) return "exception";
  if (/cache|redis|\bhit\b|\bmiss\b|memcache|\bttl\b/.test(s)) return "cache";
  if (/emit|publish|event|async|enqueue|\bqueue\b|kafka|\btopic\b|stream|notify|webhook|fire/.test(s)) return "async";
  if (kind === "dashed") return "response";
  return "request";
}
var SEMANTIC_ORDER = ["request", "response", "cache", "async", "exception"];
var SEMANTIC_LABEL = {
  request: "request",
  response: "response",
  cache: "cache",
  async: "async",
  exception: "exception"
};

// src/native/sequence/layout.ts
var MARGIN = 24;
var MIN_BOX_W = 90;
var LABEL_PAD = 18;
var LABEL_RISE = 12;
var SELF_LOOP_W = 40;
var SELF_LOOP_H = 30;
var BOUNDS_PADDING2 = 20;
function textWidth(label, fontSize) {
  const longest = label.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
  return longest * fontSize * 0.6;
}
function labelBox(label, fontSize, lineHeight) {
  const lines = label ? label.split("\n") : [];
  const w = label ? textWidth(label, fontSize) + 10 : 0;
  const h = label ? lines.length * lineHeight + 4 : 0;
  return { w, h };
}
function layoutSequence(model, opts = {}) {
  const theme = opts.theme ?? themes.light;
  const t = theme.tokens;
  const fontSize = t.font.size;
  const lineHeight = t.font.lineHeight;
  const types = model.participants.map((p) => typeLabel(p.label));
  const twoLine = types.some((ty) => ty !== "");
  const typeFont = fontSize - 2;
  const boxH = lineHeight * (twoLine ? 2 : 1) + t.spacing.nodePadY * 2;
  const rowPitch = Math.max(44, lineHeight * 2 + 8);
  const topGap = lineHeight + 12;
  const bottomGap = lineHeight + 8;
  const colSep = t.spacing.nodesep;
  const order = /* @__PURE__ */ new Map();
  model.participants.forEach((p, i) => order.set(p.id, i));
  const widths = model.participants.map(
    (p, i) => Math.max(
      MIN_BOX_W,
      textWidth(p.label, fontSize) + t.spacing.nodePadX * 2,
      textWidth(types[i], typeFont) + t.spacing.nodePadX * 2
    )
  );
  const adjacentLabel = new Array(Math.max(0, widths.length - 1)).fill(0);
  for (const m of model.messages) {
    if (m.self) continue;
    const a = order.get(m.from);
    const b = order.get(m.to);
    if (a === void 0 || b === void 0) continue;
    if (Math.abs(a - b) !== 1) continue;
    const gap = Math.min(a, b);
    const need = textWidth(m.label, fontSize) + LABEL_PAD;
    adjacentLabel[gap] = Math.max(adjacentLabel[gap], need);
  }
  const xs = [];
  for (let i = 0; i < widths.length; i++) {
    if (i === 0) {
      xs.push(MARGIN + widths[0] / 2);
      continue;
    }
    const base = widths[i - 1] / 2 + widths[i] / 2 + colSep;
    const gap = Math.max(base, adjacentLabel[i - 1]);
    xs.push(xs[i - 1] + gap);
  }
  const boxTop = MARGIN + boxH / 2;
  const lifelineTop = boxTop + boxH / 2;
  const participants = model.participants.map((p, i) => ({
    ...p,
    x: xs[i],
    width: widths[i],
    height: boxH,
    type: types[i] || void 0
  }));
  const messages = [];
  let y = lifelineTop + topGap;
  let lastBottom = lifelineTop;
  for (const m of model.messages) {
    const fromI = order.get(m.from);
    const toI = order.get(m.to);
    if (fromI === void 0 || toI === void 0) continue;
    const fromX = xs[fromI];
    const semantic = messageSemantic(m.kind, m.label);
    if (m.self) {
      const toX = fromX;
      messages.push({
        ...m,
        semantic,
        y,
        fromX,
        toX,
        loopWidth: SELF_LOOP_W,
        loopHeight: SELF_LOOP_H,
        labelX: fromX + SELF_LOOP_W + 8 + labelBox(m.label, fontSize, lineHeight).w / 2,
        labelY: y + SELF_LOOP_H / 2
      });
      lastBottom = y + SELF_LOOP_H;
      y += SELF_LOOP_H + rowPitch - lineHeight;
    } else {
      const toX = xs[toI];
      messages.push({
        ...m,
        semantic,
        y,
        fromX,
        toX,
        labelX: (fromX + toX) / 2,
        labelY: y - LABEL_RISE
      });
      lastBottom = y;
      y += rowPitch;
    }
  }
  const lifelineBottom = lastBottom + bottomGap;
  const boxBottom = lifelineBottom + boxH / 2;
  const ACTIVATION_W = 10;
  const byOrder = new Map(messages.map((m) => [m.order, m]));
  const activations = (model.activations ?? []).map((a) => {
    const pi = order.get(a.participant);
    const px = pi !== void 0 ? xs[pi] : 0;
    const sm = byOrder.get(a.startOrder);
    const em = byOrder.get(a.endOrder);
    const startY = sm ? sm.y : lifelineTop;
    const endY = em ? em.self && em.loopHeight ? em.y + em.loopHeight : em.y : lifelineBottom;
    return {
      participant: a.participant,
      x: px + a.depth * (ACTIVATION_W - 3),
      width: ACTIVATION_W,
      startY,
      endY: Math.max(endY, startY + 10)
    };
  });
  const used = new Set(messages.map((m) => m.semantic));
  const legend = SEMANTIC_ORDER.filter((s) => used.has(s));
  const legendH = legend.length ? lineHeight + 6 : 0;
  const legendY = boxBottom + boxH / 2 + 22 + legendH / 2;
  const boxes = [];
  for (const p of participants) {
    boxes.push({ x: p.x, y: boxTop, width: p.width, height: boxH });
    boxes.push({ x: p.x, y: boxBottom, width: p.width, height: boxH });
  }
  const extra = [];
  for (const m of messages) {
    extra.push({ x: m.fromX, y: m.y }, { x: m.toX, y: m.y });
    const lb = labelBox(m.label, fontSize, lineHeight);
    if (lb.w > 0) {
      extra.push(
        { x: m.labelX - lb.w / 2, y: m.labelY - lb.h / 2 },
        { x: m.labelX + lb.w / 2, y: m.labelY + lb.h / 2 }
      );
    }
    if (m.self && m.loopWidth && m.loopHeight) {
      extra.push({ x: m.fromX + m.loopWidth, y: m.y + m.loopHeight });
    }
  }
  if (legend.length) {
    const legendLeft = xs[0] - widths[0] / 2;
    extra.push({ x: legendLeft, y: legendY - legendH / 2 }, { x: legendLeft + legend.length * 132, y: legendY + legendH / 2 });
  }
  const bounds = contentBounds(boxes, extra, BOUNDS_PADDING2);
  return {
    kind: "sequence-layout",
    participants,
    messages,
    boxTop,
    boxBottom,
    lifelineTop,
    lifelineBottom,
    activations,
    legend,
    legendY,
    bounds
  };
}

// src/rough/index.ts
var SKETCH = {
  /** Outline vertex jitter amplitude (px). */
  roughness: 2.4,
  /** How far a segment bows at its midpoint (px). */
  bowing: 2.2,
  /** Overlaid outline strokes per shape (the multi-stroke wobble). */
  outlineStrokes: 2,
  /** Fill uses a single softened stroke under the outline. */
  fillRoughness: 1.2
};
function rn(v) {
  return Math.round(v * 100) / 100;
}
function roughSeed(key) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function strokePath(pts, closed, rand, rough, bow) {
  if (pts.length === 0) return "";
  const jv = pts.map(([x, y]) => [x + (rand() * 2 - 1) * rough, y + (rand() * 2 - 1) * rough]);
  const seq = closed ? [...jv, jv[0]] : jv;
  let d = "M " + rn(seq[0][0]) + " " + rn(seq[0][1]);
  for (let i = 1; i < seq.length; i++) {
    const ax = seq[i - 1][0];
    const ay = seq[i - 1][1];
    const bx = seq[i][0];
    const by = seq[i][1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const px = -(by - ay) / len;
    const py = (bx - ax) / len;
    const k = (rand() * 2 - 1) * bow;
    const cx = (ax + bx) / 2 + px * k;
    const cy = (ay + by) / 2 + py * k;
    d += " Q " + rn(cx) + " " + rn(cy) + " " + rn(bx) + " " + rn(by);
  }
  if (closed) d += " Z";
  return d;
}
function roughShape(pts, key) {
  const fill = strokePath(pts, true, mulberry32(roughSeed(key + "#f")), SKETCH.fillRoughness, SKETCH.bowing);
  const outline = [];
  for (let s = 0; s < SKETCH.outlineStrokes; s++) {
    outline.push(strokePath(pts, true, mulberry32(roughSeed(key + "#o" + s)), SKETCH.roughness, SKETCH.bowing));
  }
  return { fill, outline };
}
function roughPolyline(pts, key) {
  const out = [];
  for (let s = 0; s < SKETCH.outlineStrokes; s++) {
    out.push(strokePath(pts, false, mulberry32(roughSeed(key + "#e" + s)), SKETCH.roughness * 0.8, SKETCH.bowing * 0.8));
  }
  return out;
}
function openArrowhead(tip, from, size, key) {
  const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const r = mulberry32(roughSeed(key + "#a"));
  const spread = 0.52;
  const len = size * 2.1;
  const a1 = ang + Math.PI - spread + (r() * 2 - 1) * 0.12;
  const a2 = ang + Math.PI + spread + (r() * 2 - 1) * 0.12;
  const l1 = len * (1 + (r() * 2 - 1) * 0.14);
  const l2 = len * (1 + (r() * 2 - 1) * 0.14);
  const b1x = tip[0] + Math.cos(a1) * l1;
  const b1y = tip[1] + Math.sin(a1) * l1;
  const b2x = tip[0] + Math.cos(a2) * l2;
  const b2y = tip[1] + Math.sin(a2) * l2;
  return "M " + rn(b1x) + " " + rn(b1y) + " L " + rn(tip[0]) + " " + rn(tip[1]) + " L " + rn(b2x) + " " + rn(b2y);
}

// src/render/sketch-svg.ts
function sketchFontDefs() {
  return `<style>${sketchFontFaceCss()}</style>`;
}
function shapeMarkup(rs, fill, stroke, sw) {
  const strokeAttr = ` fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;
  let out = fill === "none" ? "" : `<path d="${rs.fill}" fill="${fill}" stroke="none"/>`;
  for (const d of rs.outline) out += `<path d="${d}"${strokeAttr}/>`;
  return out;
}
function sketchRectSvg(x, y, w, h, fill, stroke, sw, key) {
  return shapeMarkup(roughShape([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], key), fill, stroke, sw);
}
function sketchLineSvg(pts, stroke, sw, key, dash = "") {
  const strokeAttr = ` fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"${dash}`;
  let out = "";
  for (const d of roughPolyline(pts, key)) out += `<path d="${d}"${strokeAttr}/>`;
  return out;
}
function sketchArrowSvg(tip, from, size, stroke, sw, key) {
  return `<path d="${openArrowhead(tip, from, size, key)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

// src/native/sequence/svg.ts
function participantColors(label, theme) {
  const t = theme.tokens;
  const role = inferRole(label);
  const rc = role ? t.colors.roles[role] : void 0;
  return { fill: rc?.fill ?? t.colors.surface, stroke: rc?.stroke ?? t.colors.surfaceStroke, text: rc?.text ?? t.colors.text };
}
function semanticColor(sem, t) {
  const roles = t.colors.roles;
  switch (sem) {
    case "request":
      return roles.backend?.stroke ?? t.colors.accent;
    case "cache":
      return roles.database?.stroke ?? t.colors.accent;
    case "async":
      return roles.messagebus?.stroke ?? t.colors.accent;
    case "exception":
      return roles.danger?.stroke ?? "#ef4444";
    case "response":
    default:
      return t.colors.edge;
  }
}
var markerId = (sem) => "vnm-arrow-" + (sem ?? "response");
function renderSequenceSvg(layout2, theme, background, style = "clean") {
  const b = layout2.bounds;
  const t = theme.tokens;
  const sketch = style === "sketch";
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(b.width)}" height="${n(
      b.height
    )}" viewBox="${n(b.x)} ${n(b.y)} ${n(b.width)} ${n(b.height)}" font-family="${escapeXmlAttr(
      sketch ? SKETCH_FONT_FAMILY : t.font.family
    )}">`
  );
  parts.push(defs(theme, sketch));
  for (const p of layout2.participants) parts.push(renderLifeline(p, layout2, theme, sketch));
  for (const a of layout2.activations) parts.push(renderActivation(a, layout2, theme, sketch));
  layout2.messages.forEach((m, i) => parts.push(renderMessage(m, theme, sketch, i)));
  for (const p of layout2.participants) {
    parts.push(renderParticipant(p, layout2.boxTop, theme, sketch, "t"));
    parts.push(renderParticipant(p, layout2.boxBottom, theme, sketch, "b"));
  }
  if (layout2.legend.length) parts.push(renderLegend(layout2, theme));
  parts.push("</svg>");
  return parts.join("\n");
}
var SEMANTICS = ["request", "response", "cache", "async", "exception"];
function defs(theme, sketch) {
  const t = theme.tokens;
  const a = t.edge.arrowSize;
  const shadow = t.effects.gradient ? `<filter id="vnm-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.35"/></filter>` : "";
  const marker = (id, fill) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${a}" markerHeight="${a}" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${fill}"/></marker>`;
  return `<defs>` + marker("vnm-arrow", t.colors.edge) + SEMANTICS.map((s) => marker(markerId(s), semanticColor(s, t))).join("") + shadow + (sketch ? sketchFontDefs() : "") + `</defs>`;
}
function renderLifeline(p, layout2, theme, sketch) {
  const stroke = participantColors(p.label, theme).stroke;
  if (sketch) {
    return sketchLineSvg(
      [
        [p.x, layout2.lifelineTop],
        [p.x, layout2.lifelineBottom]
      ],
      stroke,
      1,
      "life:" + p.id,
      ' stroke-dasharray="4 4"'
    );
  }
  return `<line x1="${n(p.x)}" y1="${n(layout2.lifelineTop)}" x2="${n(p.x)}" y2="${n(
    layout2.lifelineBottom
  )}" stroke="${stroke}" stroke-width="1" stroke-dasharray="4 4"/>`;
}
function renderParticipant(p, cy, theme, sketch, posKey) {
  const t = theme.tokens;
  const x = p.x - p.width / 2;
  const y = cy - p.height / 2;
  const shadow = t.effects.gradient && !sketch ? ` filter="url(#vnm-shadow)"` : "";
  const c = participantColors(p.label, theme);
  const rect = sketch ? sketchRectSvg(x, y, p.width, p.height, c.fill, c.stroke, "1.5", "p:" + p.id + "@" + posKey) : `<rect x="${n(x)}" y="${n(y)}" width="${n(p.width)}" height="${n(
    p.height
  )}" rx="${t.radii.card}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>`;
  const nameY = p.type ? cy - t.font.lineHeight * 0.42 : cy;
  const text = `<text x="${n(p.x)}" y="${n(nameY)}" fill="${c.text}" font-size="${t.font.size}" font-weight="${t.font.weight}" text-anchor="middle" dominant-baseline="central">${escapeXml(p.label)}</text>` + (p.type ? `<text x="${n(p.x)}" y="${n(cy + t.font.lineHeight * 0.52)}" fill="${c.stroke}" font-size="${t.font.size - 2}" text-anchor="middle" dominant-baseline="central" opacity="0.85">${escapeXml(p.type)}</text>` : "");
  return `<g${shadow}>${rect}${text}</g>`;
}
function renderMessage(m, theme, sketch, index) {
  const t = theme.tokens;
  const dash = m.kind === "dashed" ? ` stroke-dasharray="6 4"` : "";
  const color = semanticColor(m.semantic, t);
  const marker = m.arrowEnd ? ` marker-end="url(#${markerId(m.semantic)})"` : "";
  const parts = [];
  if (sketch) {
    const dashAttr = m.kind === "dashed" ? ' stroke-dasharray="6 4"' : "";
    const key = "msg:" + index;
    let pts;
    if (m.self && m.loopWidth && m.loopHeight) {
      const x = m.fromX, w = m.loopWidth, h = m.loopHeight;
      pts = [
        [x, m.y],
        [x + w, m.y],
        [x + w, m.y + h],
        [x, m.y + h]
      ];
    } else {
      pts = [
        [m.fromX, m.y],
        [m.toX, m.y]
      ];
    }
    parts.push(sketchLineSvg(pts, color, t.edge.width, key, dashAttr));
    const mlen = pts.length;
    if (m.arrowEnd && mlen >= 2)
      parts.push(sketchArrowSvg(pts[mlen - 1], pts[mlen - 2], t.edge.arrowSize, color, t.edge.width, key + "@end"));
    if (m.label) parts.push(messageLabel(m.label, m.labelX, m.labelY, theme));
    return parts.join("");
  }
  if (m.self && m.loopWidth && m.loopHeight) {
    const x = m.fromX;
    const w = m.loopWidth;
    const h = m.loopHeight;
    const d = `M ${n(x)} ${n(m.y)} L ${n(x + w)} ${n(m.y)} L ${n(x + w)} ${n(m.y + h)} L ${n(x)} ${n(m.y + h)}`;
    parts.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${t.edge.width}" stroke-linejoin="round"${dash}${marker}/>`
    );
  } else {
    parts.push(
      `<line x1="${n(m.fromX)}" y1="${n(m.y)}" x2="${n(m.toX)}" y2="${n(m.y)}" stroke="${color}" stroke-width="${t.edge.width}" stroke-linecap="round"${dash}${marker}/>`
    );
  }
  if (m.label) parts.push(messageLabel(m.label, m.labelX, m.labelY, theme));
  return parts.join("");
}
function renderActivation(a, layout2, theme, sketch) {
  const t = theme.tokens;
  const p = layout2.participants.find((pp) => pp.id === a.participant);
  const c = p ? participantColors(p.label, theme) : { fill: t.colors.surface, stroke: t.colors.edge };
  const x = a.x - a.width / 2;
  const h = a.endY - a.startY;
  if (sketch) {
    return sketchRectSvg(x, a.startY, a.width, h, c.fill, c.stroke, "1", "act:" + a.participant + "@" + Math.round(a.startY));
  }
  return `<rect x="${n(x)}" y="${n(a.startY)}" width="${n(a.width)}" height="${n(h)}" rx="2" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1"/>`;
}
function renderLegend(layout2, theme) {
  const t = theme.tokens;
  const y = layout2.legendY;
  const fs = t.font.size - 2;
  const swatch = 22;
  let x = layout2.bounds.x + 24;
  const parts = [];
  for (const sem of layout2.legend) {
    const color = semanticColor(sem, t);
    parts.push(
      `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + swatch)}" y2="${n(y)}" stroke="${color}" stroke-width="${t.edge.width}" stroke-linecap="round" marker-end="url(#${markerId(sem)})"/>`
    );
    const label = SEMANTIC_LABEL[sem];
    parts.push(
      `<text x="${n(x + swatch + 6)}" y="${n(y)}" fill="${t.colors.subgraphText}" font-size="${fs}" dominant-baseline="central">${escapeXml(
        label
      )}</text>`
    );
    x += swatch + 6 + label.length * fs * 0.6 + 24;
  }
  return `<g>${parts.join("")}</g>`;
}
function messageLabel(label, cx, cy, theme) {
  const t = theme.tokens;
  const lines = label.split("\n");
  const maxChars = lines.reduce((mx, l) => Math.max(mx, l.length), 0);
  const w = maxChars * t.font.size * 0.6 + 6;
  const h = lines.length * t.font.lineHeight + 2;
  const x = n(cx - w / 2);
  const y = n(cy - h / 2);
  const parts = [
    `<rect x="${x}" y="${y}" width="${n(w)}" height="${n(h)}" rx="${t.radii.label}" fill="${t.colors.edgeLabelBg}"/>`
  ];
  const startY = cy - (lines.length - 1) * t.font.lineHeight / 2;
  lines.forEach((line, i) => {
    parts.push(
      `<text x="${n(cx)}" y="${n(startY + i * t.font.lineHeight)}" fill="${t.colors.edgeLabelText}" font-size="${t.font.size - 1}" text-anchor="middle" dominant-baseline="central">${escapeXml(
        line
      )}</text>`
    );
  });
  return parts.join("");
}

// src/native/sequence/interactive.ts
function buildSequencePayload(layout2, theme, opts = {}) {
  const b = layout2.bounds;
  const boxes = [];
  for (const p of layout2.participants) {
    for (const cy of [layout2.boxTop, layout2.boxBottom]) {
      boxes.push({
        x: p.x - p.width / 2 - b.x,
        y: cy - p.height / 2 - b.y,
        w: p.width,
        h: p.height
      });
    }
  }
  const lines = layout2.messages.map((m) => m.y - b.y);
  return {
    // The static sketch SVG carries its own embedded @font-face, so the pan/zoom
    // shell shows the hand-drawn look with zero network.
    svg: renderSequenceSvg(layout2, theme, "transparent", opts.style),
    cssVars: theme.cssVars(),
    bg: theme.tokens.colors.background,
    content: { width: b.width, height: b.height },
    minimap: {
      boxes,
      lines,
      accent: theme.tokens.colors.accent,
      viewport: theme.tokens.colors.minimapViewport
    },
    options: {
      fitPadding: opts.fitPadding ?? theme.tokens.spacing.fitPadding,
      minimap: opts.minimap ?? true,
      minScale: opts.minScale ?? 0.2,
      maxScale: opts.maxScale ?? 4
    }
  };
}
function mountSequence(el, layout2, theme, opts = {}) {
  return seqRuntime(el, buildSequencePayload(layout2, theme, opts));
}

// src/native/read-util.ts
function hasClass2(el, token) {
  const cls = el.getAttribute("class");
  return cls ? cls.split(/\s+/).includes(token) : false;
}
function pathPoints(d) {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}
function parseTranslate(transform) {
  if (!transform) return null;
  const m = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(transform);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
}
function readEdgeLabelMap(doc) {
  const map = /* @__PURE__ */ new Map();
  const layer = doc.querySelector("g.edgeLabels");
  if (!layer) return map;
  for (const g of Array.from(layer.querySelectorAll("g[data-id]"))) {
    const id = g.getAttribute("data-id");
    const text = (g.querySelector("text")?.textContent ?? "").trim();
    if (id && text && !map.has(id)) map.set(id, text);
  }
  return map;
}

// src/native/class/read.ts
var READ_ID2 = "vnm-class-read";
async function renderMermaidSvg2(dsl) {
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    deterministicIds: true,
    // SVG <text>/<tspan> labels, not HTML <foreignObject> — measurable + clean.
    htmlLabels: false,
    class: { htmlLabels: false }
  });
  const { svg } = await mermaid.render(READ_ID2, dsl);
  return svg;
}
function groupByClass(root, token) {
  for (const g of Array.from(root.querySelectorAll("g"))) {
    if (hasClass2(g, token)) return g;
  }
  return null;
}
function parseMember(row) {
  const text = row.trim();
  const first = text.charAt(0);
  if (first === "+" || first === "-" || first === "#" || first === "~") {
    return { visibility: first, text: text.slice(1).trim() };
  }
  return { visibility: "", text };
}
function readRows(group) {
  if (!group) return [];
  const rows = [];
  for (const rowG of Array.from(group.children)) {
    const t = rowG.querySelector("text");
    const raw = (t?.textContent ?? rowG.textContent ?? "").trim();
    if (raw) rows.push(parseMember(raw));
  }
  return rows;
}
function classNameFromId(id) {
  const m = /^.*-classId-(.+)-\d+$/.exec(id);
  return m ? m[1] : null;
}
function readClasses(doc) {
  const classes = [];
  for (const g of Array.from(doc.querySelectorAll("g.node"))) {
    const id = g.getAttribute("id") ?? "";
    const name = classNameFromId(id);
    if (!name) continue;
    const stereoRaw = groupByClass(g, "annotation-group")?.textContent?.trim() ?? "";
    const stereotype = stereoRaw.replace(/[«»]/g, "").split(/\s{2,}/)[0]?.trim() || "";
    const labelText = groupByClass(g, "label-group")?.querySelector("text")?.textContent?.trim() || name;
    const members = readRows(groupByClass(g, "members-group"));
    const methods = readRows(groupByClass(g, "methods-group"));
    const entity = { id: name, name: labelText, members, methods };
    if (stereotype) entity.stereotype = stereotype;
    classes.push(entity);
  }
  return classes;
}
function candidateEnds(dataId, names) {
  const core = dataId.replace(/^id_/, "").replace(/_\d+$/, "");
  const parts = core.split("_");
  const out = [];
  for (let i = 1; i < parts.length; i++) {
    const from = parts.slice(0, i).join("_");
    const to = parts.slice(i).join("_");
    if (names.has(from) && names.has(to)) out.push({ from, to });
  }
  return out;
}
function nearestClass(pt, centers) {
  let best = null;
  let bestD = Infinity;
  for (const [id, c] of centers) {
    const d = (c.x - pt.x) ** 2 + (c.y - pt.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
function readClassCenters(doc) {
  const centers = /* @__PURE__ */ new Map();
  for (const g of Array.from(doc.querySelectorAll("g.node"))) {
    const name = classNameFromId(g.getAttribute("id") ?? "");
    if (!name) continue;
    const c = parseTranslate(g.getAttribute("transform"));
    if (c) centers.set(name, c);
  }
  return centers;
}
function resolveEnds2(candidates, path, centers) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const pts = pathPoints(path.getAttribute("d") ?? "");
  if (pts.length >= 2) {
    const gFrom = nearestClass(pts[0], centers);
    const gTo = nearestClass(pts[pts.length - 1], centers);
    if (gFrom && gTo) {
      const hit = candidates.find((c) => c.from === gFrom && c.to === gTo);
      if (hit) return hit;
    }
  }
  return null;
}
function markerToken(ref) {
  if (!ref) return null;
  for (const tok of ["extension", "composition", "aggregation", "dependency", "lollipop"]) {
    if (ref.includes(tok)) return tok;
  }
  return null;
}
function relationType(token, dashed) {
  switch (token) {
    case "extension":
      return dashed ? "realization" : "inheritance";
    case "composition":
      return "composition";
    case "aggregation":
      return "aggregation";
    case "dependency":
      return dashed ? "dependency" : "association";
    case "lollipop":
      return "association";
  }
}
function readRelations(doc, names, centers, warnings) {
  const paths = Array.from(doc.querySelectorAll("g.edgePaths path.relation"));
  const labels = readEdgeLabelMap(doc);
  const relations = [];
  paths.forEach((p, i) => {
    const dataId = p.getAttribute("data-id") ?? p.getAttribute("id") ?? "";
    const ends = resolveEnds2(candidateEnds(dataId, names), p, centers);
    const startRef = p.getAttribute("marker-start");
    const endRef = p.getAttribute("marker-end");
    const token = markerToken(startRef) ?? markerToken(endRef);
    if (!ends || !token) {
      warnings.push({
        severity: "warning",
        code: "class-relation-unrecoverable",
        message: `could not recover a relation (data-id='${dataId}')`,
        line: i + 1,
        col: 1
      });
      return;
    }
    const rel = {
      from: ends.from,
      to: ends.to,
      type: relationType(token, hasClass2(p, "edge-pattern-dashed")),
      head: markerToken(startRef) ? "from" : "to"
    };
    const label = labels.get(dataId);
    if (label) rel.label = label;
    relations.push(rel);
  });
  return relations;
}
async function readClassModel(dsl) {
  const svg = await renderMermaidSvg2(dsl);
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const warnings = [];
  const classes = readClasses(doc);
  const names = new Set(classes.map((c) => c.id));
  const centers = readClassCenters(doc);
  const relations = readRelations(doc, names, centers, warnings);
  return { kind: "class", classes, relations, warnings };
}

// src/native/class/card.ts
function classCardLines(entity) {
  const header = [];
  if (entity.stereotype) header.push(`\xAB${entity.stereotype}\xBB`);
  header.push(entity.name);
  const members = entity.members.map((m) => `${m.visibility}${m.text}`);
  const methods = entity.methods.map((m) => `${m.visibility}${m.text}`);
  return { header, members, methods, all: [...header, ...members, ...methods] };
}

// src/native/class/layout.ts
function layoutClass(model, opts = {}) {
  const theme = opts.theme ?? themes.light;
  const nodes = model.classes.map((c) => ({
    id: c.id,
    label: classCardLines(c).all.join("\n"),
    shape: "rect",
    classes: []
  }));
  const edges = model.relations.map((r) => {
    const edge = {
      from: r.from,
      to: r.to,
      // realization + dependency are dashed; the rest solid.
      kind: r.type === "realization" || r.type === "dependency" ? "dotted" : "solid",
      arrows: { start: r.head === "from", end: r.head === "to" },
      length: 2
    };
    if (r.label) edge.label = r.label;
    return edge;
  });
  const diagram = {
    direction: "TB",
    nodes,
    edges,
    subgraphs: [],
    classDefs: /* @__PURE__ */ new Map()};
  const positioned = layout(diagram, { theme, bridges: opts.bridges });
  return {
    kind: "class-layout",
    model: positioned,
    classes: model.classes,
    relations: model.relations
  };
}

// src/native/class/interactive.ts
function mountClass(el, layout2, theme, opts = {}) {
  return vnmRuntime(el, buildPayload(layout2.model, theme, { ...opts, arrowCaps: false }));
}

// src/native/state/read.ts
var READ_ID3 = "vnm-state-read";
async function renderMermaidSvg3(dsl) {
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    deterministicIds: true,
    htmlLabels: false,
    state: { htmlLabels: false }
  });
  const { svg } = await mermaid.render(READ_ID3, dsl);
  return svg;
}
function stateNameFromId(id) {
  const m = /^.*-state-(.+)-\d+$/.exec(id);
  return m ? m[1] : null;
}
function classifyState(g, label) {
  if (g.querySelector("circle.state-start")) return "start";
  if (label === "" && hasClass2(g, "default")) return "end";
  return "normal";
}
function readNodes(doc) {
  const nodes = [];
  for (const g of Array.from(doc.querySelectorAll("g.node"))) {
    const id = g.getAttribute("id") ?? "";
    const name = stateNameFromId(id);
    if (!name) continue;
    const label = (g.querySelector("text")?.textContent ?? "").trim();
    const kind = classifyState(g, label);
    const center = parseTranslate(g.getAttribute("transform")) ?? { x: 0, y: 0 };
    nodes.push({ id: name, label: kind === "normal" ? label : "", kind, center });
  }
  return nodes;
}
function nearest(pt, nodes) {
  let best = null;
  let bestD = Infinity;
  for (const nd of nodes) {
    const d = (nd.center.x - pt.x) ** 2 + (nd.center.y - pt.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = nd.id;
    }
  }
  return best;
}
function readTransitions(doc, nodes) {
  const paths = Array.from(doc.querySelectorAll("g.edgePaths path"));
  const labels = readEdgeLabelMap(doc);
  const transitions = [];
  for (const p of paths) {
    const pts = pathPoints(p.getAttribute("d") ?? "");
    if (pts.length < 2) continue;
    const from = nearest(pts[0], nodes);
    const to = nearest(pts[pts.length - 1], nodes);
    if (!from || !to) continue;
    const tr = { from, to };
    const label = labels.get(p.getAttribute("data-id") ?? p.getAttribute("id") ?? "");
    if (label) tr.label = label;
    transitions.push(tr);
  }
  return transitions;
}
async function readStateModel(dsl) {
  const svg = await renderMermaidSvg3(dsl);
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const nodes = readNodes(doc);
  const transitions = readTransitions(doc, nodes);
  const states = nodes.map((nd) => ({ id: nd.id, label: nd.label, kind: nd.kind }));
  return { kind: "state", states, transitions, warnings: [] };
}

// src/native/state/layout.ts
var PSEUDO = 22;
var BOUNDS_PADDING3 = 20;
function layoutState(model, opts = {}) {
  const theme = opts.theme ?? themes.light;
  const pseudo = new Set(model.states.filter((s) => s.kind !== "normal").map((s) => s.id));
  const pseudoKind = new Map(
    model.states.filter((s) => s.kind === "start" || s.kind === "end").map((s) => [s.id, s.kind === "start" ? "start" : "end"])
  );
  const nodes = model.states.map((s) => ({
    id: s.id,
    label: s.kind === "normal" ? s.label : "",
    shape: s.kind === "normal" ? "rounded" : "circle",
    classes: []
  }));
  const edges = model.transitions.map((tr) => {
    const edge = {
      from: tr.from,
      to: tr.to,
      kind: "solid",
      arrows: { start: false, end: true },
      length: 2
    };
    if (tr.label) edge.label = tr.label;
    return edge;
  });
  const diagram = {
    direction: "TB",
    nodes,
    edges,
    subgraphs: [],
    classDefs: /* @__PURE__ */ new Map()};
  const positioned = layout(diagram, { theme, bridges: opts.bridges });
  if (pseudo.size === 0) {
    return { kind: "state-layout", model: positioned, states: model.states };
  }
  const boxes = /* @__PURE__ */ new Map();
  const shrunk = positioned.nodes.map((nd) => {
    const box = pseudo.has(nd.id) ? { x: nd.x, y: nd.y, width: PSEUDO, height: PSEUDO, shape: nd.shape } : { x: nd.x, y: nd.y, width: nd.width, height: nd.height, shape: nd.shape };
    boxes.set(nd.id, box);
    const out = { ...nd, width: box.width, height: box.height };
    const marker = pseudoKind.get(nd.id);
    if (marker) out.stateMarker = marker;
    return out;
  });
  const labelSizes = positioned.edges.map((e) => labelPlateSize(e.label, theme));
  const bends = positioned.edges.map((e) => e.waypoints ?? []);
  const ports = computePerimeterPorts(positioned.edges, boxes, labelSizes, void 0, bends);
  const routed = positioned.edges.map((e, i) => {
    const from = boxes.get(e.from);
    const to = boxes.get(e.to);
    if (!from || !to) return e;
    const port = ports[i];
    const r = routeEdge(from, to, positioned.direction, theme.edgeStyle, e.waypoints ?? [], port);
    const out = { ...e, points: r.points, path: r.path };
    if (e.waypoints) out.waypoints = e.waypoints;
    if (port.source.offset !== 0 || port.target.offset !== 0 || port.labelShift) out.ports = port;
    else delete out.ports;
    if (e.label) out.labelPos = r.labelPos;
    return out;
  });
  finishEdges(
    routed,
    theme,
    opts.bridges,
    shrunk.map((nd) => ({ x: nd.x, y: nd.y, width: nd.width, height: nd.height }))
  );
  const bounds = contentBounds(
    shrunk.map((nd) => ({ x: nd.x, y: nd.y, width: nd.width, height: nd.height })),
    routed.flatMap((e) => e.points),
    BOUNDS_PADDING3
  );
  return {
    kind: "state-layout",
    model: { ...positioned, nodes: shrunk, edges: routed, bounds },
    states: model.states
  };
}

// src/native/state/interactive.ts
function mountState(el, layout2, theme, opts = {}) {
  return vnmRuntime(el, buildPayload(layout2.model, theme, { ...opts, arrowCaps: false }));
}

// src/render/dom/index.ts
async function mountAsync(el, dsl, opts = {}) {
  const theme = resolveTheme(opts.theme);
  if (isClassLayout(dsl)) return mountClass(el, dsl, theme, opts);
  if (isStateLayout(dsl)) return mountState(el, dsl, theme, opts);
  if (isSequenceLayout(dsl)) return mountSequence(el, dsl, theme, opts);
  if (typeof dsl !== "string") {
    const { model } = prepare(dsl, { theme: opts.theme, strict: opts.strict });
    return vnmRuntime(el, buildPayload(model, theme, opts));
  }
  const c = await classify(dsl);
  switch (c.renderer) {
    case "flowchart": {
      const { model } = prepare(dsl, { theme: opts.theme, strict: opts.strict });
      return vnmRuntime(el, buildPayload(model, theme, opts));
    }
    case "sequence":
      return mountSequence(el, layoutSequence(await readSequenceModel(dsl), { theme }), theme, opts);
    case "class":
      return mountClass(el, layoutClass(await readClassModel(dsl), { theme }), theme, opts);
    case "state":
      return mountState(el, layoutState(await readStateModel(dsl), { theme }), theme, opts);
    default: {
      if (opts.style === "sketch" && typeof console !== "undefined" && console.warn) {
        console.warn(
          `very-nice-mermaid: --style sketch is not supported for the mermaid.js fallback tier ('${c.detected ?? c.type}'); rendering in its normal style.`
        );
      }
      const { svg } = await renderFallbackSvg(dsl, { theme, detected: c.detected ?? c.type });
      return mountFallback(el, svg, theme, opts);
    }
  }
}
function svgContentSize(svg) {
  const vb = /viewBox="\s*-?[\d.]+\s+-?[\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(svg);
  if (vb) return { width: parseFloat(vb[1]), height: parseFloat(vb[2]) };
  const w = /\bwidth="([\d.]+)/.exec(svg);
  const h = /\bheight="([\d.]+)/.exec(svg);
  return { width: w ? parseFloat(w[1]) : 800, height: h ? parseFloat(h[1]) : 600 };
}
function mountFallback(el, svg, theme, opts) {
  const size = svgContentSize(svg);
  const payload = {
    svg,
    cssVars: theme.cssVars(),
    bg: theme.tokens.colors.background,
    content: size,
    minimap: {
      boxes: [],
      lines: [],
      accent: theme.tokens.colors.accent,
      viewport: theme.tokens.colors.minimapViewport
    },
    options: {
      fitPadding: opts.fitPadding ?? theme.tokens.spacing.fitPadding,
      minimap: false,
      // the fallback SVG is opaque to us — no structural minimap
      minScale: opts.minScale ?? 0.2,
      maxScale: opts.maxScale ?? 4
    }
  };
  return seqRuntime(el, payload);
}

// src/element.ts
var VeryNiceMermaidElement = class extends HTMLElement {
  handle = null;
  source = "";
  /** Guards against overlapping async renders (attribute changes during a render). */
  renderToken = 0;
  static get observedAttributes() {
    return ["theme", "src", "sketch"];
  }
  connectedCallback() {
    if (!this.source) this.source = (this.textContent ?? "").trim();
    this.style.display = this.style.display || "block";
    if (!this.style.height && !this.style.minHeight) this.style.minHeight = "320px";
    this.style.position = this.style.position || "relative";
    void this.renderDiagram();
  }
  disconnectedCallback() {
    this.handle?.destroy();
    this.handle = null;
  }
  attributeChangedCallback() {
    if (this.isConnected) void this.renderDiagram();
  }
  async renderDiagram() {
    const theme = this.getAttribute("theme") ?? "light";
    const style = this.hasAttribute("sketch") && this.getAttribute("sketch") !== "false" ? "sketch" : "clean";
    const src = this.getAttribute("src");
    let dsl = this.source;
    if (src) {
      try {
        dsl = await fetch(src).then((r) => r.text());
      } catch {
        dsl = this.source;
      }
    }
    if (!dsl.trim()) return;
    const token = ++this.renderToken;
    this.handle?.destroy();
    this.handle = null;
    this.textContent = "";
    try {
      const handle = await mountAsync(this, dsl, { theme, style });
      if (token !== this.renderToken) {
        handle.destroy();
        return;
      }
      this.handle = handle;
    } catch (err) {
      if (typeof console !== "undefined") {
        console.error("very-nice-mermaid:", err?.message ?? err);
      }
    }
  }
  /** The live renderer handle (after mount). */
  get diagram() {
    return this.handle;
  }
};
function defineElement(tag = "very-nice-mermaid") {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(tag)) customElements.define(tag, VeryNiceMermaidElement);
}
defineElement();

export { VeryNiceMermaidElement, defineElement };
