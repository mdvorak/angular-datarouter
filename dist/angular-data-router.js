/*
 @license (The MIT License)

 Copyright (c) 2014 Michal Dvorak <michal@mdvorak.org>

 Permission is hereby granted, free of charge, to any person obtaining
 a copy of this software and associated documentation files (the
 'Software'), to deal in the Software without restriction, including
 without limitation the rights to use, copy, modify, merge, publish,
 distribute, sublicense, and/or sell copies of the Software, and to
 permit persons to whom the Software is furnished to do so, subject to
 the following conditions:

 The above copyright notice and this permission notice shall be
 included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFINGEMENT.
 IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

(function (angular) {
    "use strict";

    var module = angular.module('mdvorakDataRouter', []);

    module.factory('$routeData', ["$rootScope", function routeDataFactory($rootScope) {
        var routeData = $rootScope.$new(true);

        // Auto-detachable listeners
        routeData.$on = function (name, listener, scope) {
            var remover = $rootScope.$on.call(routeData, name, listener);

            // Automatically detach listener
            if (scope) scope.$on('$destroy', remover);
            return remover;
        };

        /**
         * Attaches given scope to the service, causing event $routeDataUpdated to be propagated to it.
         *
         * @param scope {Scope} Scope that should be attached.
         */
        routeData.$attachScope = function (scope) {
            if (!scope) throw new Error("scope is required");

            return routeData.$on('$routeDataUpdated', function (e, data) {
                scope.$broadcast('$routeDataUpdated', data);
            }, scope);
        };

        return routeData;
    }]);

    module.provider('$dataRouterRegistry', ["$$dataRouterMatchMap", function dataRouterRegistryProvider($$dataRouterMatchMap) {
        var provider = this;
        var views = provider.$$views = $$dataRouterMatchMap.create();

        /**
         * Configures view for given content type.
         * <p>
         * Note: Wildcard or function matchers are much slower then exact match. The are iterated one by one, in order of registration.
         * Exact string matchers takes always precedence over function matchers.
         *
         * @param mediaType {String|Function} Content type to match. When there is no / in the string, it is considered
         *                                   subtype of <code>application/</code> type. You should not include suffixes
         *                                   like <code>+json</code>, it is ignored by the matcher. Wildcards are supported.
         *                                   <p>
         *                                   It can be function with signature [Boolean] function([String]) as well.
         * @param config {Object} Configuration object, similar to ngRoute one. Allowed keys are:
         *                        <code>template, templateUrl, controller, controllerAs, dataAs, resolve</code>,
         *                        where either <code>template</code> or <code>templateUrl</code> must be specified.
         *                        <code>template</code> has precedence over <code>templateUrl</code>.
         *                        <code>controller</code> is optional. Can be either String reference or declaration
         *                        according to $injector rules. <code>resolve</code> is map of resolvables, that are
         *                        resolved before controller is created, and are injected into controller. Same behavior
         *                        as in ngRoute.
         */
        provider.when = function (mediaType, config) {
            // Make our copy
            config = angular.copy(config);

            if (angular.isFunction(mediaType)) {
                // Matcher function
                views.addMatcher(mediaType, config);
            } else {
                // Normalize mimeType
                mediaType = normalizeMediaType(mediaType);
                // Register
                views.addMatcher(mediaType, config);
            }

            return provider;
        };

        /**
         * Configures view for error page. Displayed when resource or view template cannot be loaded.
         *
         * @param config {Object} Configuration object, as in #when().
         */
        provider.error = function (config) {
            views.addMatcher('$error', angular.copy(config));
            return provider;
        };

        // Factory
        this.$get = function () {
            return {
                RouteError: RouteError,
                normalizeMediaType: normalizeMediaType,

                match: function (mediaType) {
                    return views.match(mediaType);
                },

                isKnownType: function (type) {
                    return type && !!this.match(normalizeMediaType(type));
                }
            };
        };
    }]);

    module.provider('$dataRouterLoader', function dataRouterLoaderProvider() {
        var provider = this;
        // Intentionally using document object instead of $document
        var urlParsingNode = document.createElement("a");

        provider.global = function global(config) {
            if (!config) return;

            if (angular.isObject(config.resolve)) {
                provider.$globalResolve = angular.extend(provider.$globalResolve || {}, config.resolve);
            }

            return provider;
        };

        provider.$$normalizeUrl = function $$normalizeUrl(href) {
            if (href) {
                urlParsingNode.setAttribute("href", href);
                return urlParsingNode.href;
            }

            return null;
        };

        this.$get = ["$log", "$sce", "$http", "$templateCache", "$q", "$injector", "$dataRouterRegistry", function dataRouterLoaderFactory($log, $sce, $http, $templateCache, $q, $injector, $dataRouterRegistry) {
            var dataRouterLoader = {
                RouteError: RouteError,
                normalizeMediaType: normalizeMediaType,

                loadData: function loadData(url) {
                    // Fetch data and return promise
                    return $http.get(url).then(function (response) {
                        // Match existing resource
                        var mediaType = normalizeMediaType(response.headers('Content-Type')) || 'text/plain';
                        var view = $dataRouterRegistry.match(mediaType);

                        // Unknown media type
                        if (!view) {
                            return $q.reject({
                                status: 999,
                                statusText: "Application Error",
                                data: "Unknown content type " + mediaType,
                                config: response.config,
                                headers: angular.noop
                            });
                        }

                        // Success
                        return {
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers,
                            config: response.config,
                            mediaType: mediaType,
                            data: response.data,
                            view: view
                        };
                    });
                },

                loadView: function loadView(response) {
                    return $q.when(response).then(function (response) {
                        // Resolve view
                        if (response.view) {
                            // Prepare locals
                            var locals = angular.extend({}, provider.$globalResolve, response.view.resolve);
                            var template;

                            // Built-in locals
                            var builtInLocals = {
                                $data: response.data,
                                $dataType: response.mediaType,
                                $dataUrl: response.config.url,
                                $dataResponse: response
                            };

                            // Resolve locals
                            if (locals) {
                                angular.forEach(locals, function (value, key) {
                                    locals[key] = angular.isString(value) ?
                                        $injector.get(value) : $injector.invoke(value, '$dataRouterLoader', builtInLocals);
                                });
                            } else {
                                locals = {};
                            }

                            // Load template
                            template = dataRouterLoader.$$loadTemplate(response.view);

                            if (angular.isDefined(template)) {
                                locals['$template'] = template;
                            }

                            return $q.all(locals).then(function (locals) {
                                // Built-in locals
                                angular.extend(locals, builtInLocals);

                                // Store locals and continue
                                response.locals = locals;
                                return response;
                            }, function () {
                                // Failure
                                return $q.reject({
                                    status: 999,
                                    statusText: "Application Error",
                                    data: "Failed to resolve view " + response.mediaType,
                                    config: response.config,
                                    headers: angular.noop
                                });
                            });
                        }

                        // Return original object
                        return response;
                    });
                },

                prefetchTemplate: function prefetchTemplate(mediaType) {
                    var view = $dataRouterRegistry.match(mediaType);

                    if (view) {
                        $log.debug("Prefetching template for " + mediaType);
                        dataRouterLoader.$$loadTemplate(view);
                    } else {
                        $log.debug("Cannot prefetch template for " + mediaType + ", type is not registered");
                    }
                },

                $$normalizeUrl: function $$normalizeUrl(href) {
                    return provider.$$normalizeUrl(href);
                },

                $$loadTemplate: function loadTemplate(view) {
                    // Ripped from ngRoute
                    var template, templateUrl;

                    if (angular.isDefined(template = view.template)) {
                        if (angular.isFunction(template)) {
                            template = template(view.params);
                        }
                    } else if (angular.isDefined(templateUrl = view.templateUrl)) {
                        if (angular.isFunction(templateUrl)) {
                            templateUrl = templateUrl(view.params);
                        }

                        templateUrl = view.loadedTemplateUrl || $sce.getTrustedResourceUrl(templateUrl);

                        if (angular.isDefined(templateUrl)) {
                            view.loadedTemplateUrl = templateUrl;

                            template = $http.get(templateUrl, {cache: $templateCache}).
                                then(function (response) {
                                    return response.data;
                                });
                        }
                    }

                    return template;
                }
            };

            return dataRouterLoader;
        }];
    });

    module.provider('$dataRouter', ["$$dataRouterMatchMap", "$dataRouterRegistryProvider", "$dataRouterLoaderProvider", function dataRouterProvider($$dataRouterMatchMap, $dataRouterRegistryProvider, $dataRouterLoaderProvider) {
        var provider = this;

        /**
         * Map of redirects. Do not modify directly, use redirect function.
         * @type {Object}
         */
        provider.$redirects = $$dataRouterMatchMap.create();

        /**
         * Api prefix variable. Do not modify directly, use accessor function.
         *
         * @type {string}
         * @protected
         */
        provider.$apiPrefix = '';

        /**
         * Configures prefix for default view to resource mapping.
         *
         * @param prefix {String} Relative URL prefix, relative to base href.
         * @return {string} API URL prefix. It's absolute URL, includes base href.
         */
        provider.apiPrefix = function apiPrefix(prefix) {
            if (arguments.length > 0) {
                provider.$apiPrefix = $dataRouterLoaderProvider.$$normalizeUrl(prefix);
            }

            return provider.$apiPrefix;
        };

        /**
         * Maps view path to resource URL. Can be overridden during configuration.
         * By default it maps path to API one to one.
         * <p>
         * Counterpart to #mapApiToView(). If you override one, override the other as well.
         *
         * @param path {String} View path, as in $location.path().
         * @returns {String} Resource url, for e.g. HTTP requests.
         */
        provider.mapViewToApi = function mapViewToApi(path) {
            return joinUrl(provider.$apiPrefix, path);
        };

        /**
         * Maps resource URL to view path. Can be overridden during configuration.
         * By default it maps APU url to view paths one to one.
         * <p>
         * Counterpart to #mapViewToApi(). If you override one, override the other as well.
         *
         * @param url {String} Resource url. Unless provider is configured otherwise, it must be inside API namespace.
         * @returns {String} View path.
         */
        provider.mapApiToView = function mapApiToView(url) {
            // Normalize
            url = $dataRouterLoaderProvider.$$normalizeUrl(url);

            if (url && url.indexOf(provider.$apiPrefix) === 0) {
                return url.substring(provider.$apiPrefix.length);
            }

            // Unable to map
            return null;
        };

        /**
         * Configures view for given content type.
         * <p>
         * Note: Wildcard or function matchers are much slower then exact match. The are iterated one by one, in order of registration.
         * Exact string matchers takes always precedence over function matchers.
         *
         * @param mediaType {String|Function} Content type to match. When there is no / in the string, it is considered
         *                                   subtype of <code>application/</code> type. You should not include suffixes
         *                                   like <code>+json</code>, it is ignored by the matcher. Wildcards are supported.
         *                                   <p>
         *                                   It can be function with signature [Boolean] function([String]) as well.
         * @param config {Object} Configuration object, similar to ngRoute one. Allowed keys are:
         *                        <code>template, templateUrl, controller, controllerAs, dataAs, resolve</code>,
         *                        where either <code>template</code> or <code>templateUrl</code> must be specified.
         *                        <code>template</code> has precedence over <code>templateUrl</code>.
         *                        <code>controller</code> is optional. Can be either String reference or declaration
         *                        according to $injector rules. <code>resolve</code> is map of resolvables, that are
         *                        resolved before controller is created, and are injected into controller. Same behavior
         *                        as in ngRoute.
         * @returns {Object} Returns provider.
         */
        provider.when = function when(mediaType, config) {
            $dataRouterRegistryProvider.when(mediaType, config);
            return provider;
        };

        /**
         * Configures view for error page. Displayed when resource or view template cannot be loaded.
         *
         * @param config {Object} Configuration object, as in #when().
         * @returns {Object} Returns provider.
         */
        provider.error = function error(config) {
            $dataRouterRegistryProvider.error(angular.copy(config));
            return provider;
        };

        /**
         * Forces redirect from one view to another.
         *
         * @param path {String} View to force redirect on. Supports wildcards. Parameters are not supported
         * @param redirectTo {String} View path which should be redirected to.
         * @returns {Object} Returns provider.
         */
        provider.redirect = function redirect(path, redirectTo) {
            if (redirectTo) {
                provider.$redirects.addMatcher(path, redirectTo);
            }

            return provider;
        };

        /**
         * Sets global router configuration, applicable for all routes.<br>
         * Currently only resolve is supported.
         *
         * @param config {Object} Configuration object. Only resolve key is currently supported.
         * @returns {Object} Returns provider.
         */
        provider.global = function global(config) {
            $dataRouterLoaderProvider.global(config);
            return provider;
        };

        this.$get = ["$log", "$location", "$rootScope", "$q", "$routeData", "$dataRouterRegistry", "$dataRouterLoader", function dataRouteFactory($log, $location, $rootScope, $q, $routeData, $dataRouterRegistry, $dataRouterLoader) {
            var dataRouter = {
                normalizeMediaType: normalizeMediaType,

                /**
                 * Routing error.
                 *
                 * @param msg {String} Error message.
                 * @param status {Number} Response status code.
                 * @constructor
                 */
                RouteError: RouteError,

                /**
                 * Maps view path to resource URL. Can be overridden during configuration.
                 * By default it maps path to API one to one.
                 * <p>
                 * Counterpart to #mapApiToView(). If you override one, override the other as well.
                 *
                 * @param path {String} View path, as in $location.path().
                 * @returns {String} Resource url, for e.g. HTTP requests.
                 */
                mapViewToApi: function (path) {
                    return provider.mapViewToApi(path);
                },


                /**
                 * Maps resource URL to view path. Can be overridden during configuration.
                 * By default it maps APU url to view paths one to one.
                 * <p>
                 * Counterpart to #mapViewToApi(). If you override one, override the other as well.
                 *
                 * @param url {String} Resource url. Unless provider is configured otherwise, it must be inside API namespace.
                 * @returns {String} View path.
                 */
                mapApiToView: function (url) {
                    return provider.mapApiToView(url);
                },

                /**
                 * Returns true  if the type matches a registered view, false if we don't know how to view it.
                 *
                 * @param type {String} Matched content type.
                 * @returns {boolean} true if type is ahs registered view, false otherwise.
                 */
                isKnownType: function (type) {
                    return $dataRouterRegistry.isKnownType(type);
                },

                /**
                 * Gets or sets current view resource url.
                 *
                 * @param url {String?} New resource url. Performs location change.
                 * @returns {String} Resource url that is being currently viewed.
                 */
                url: function (url) {
                    // Getter
                    if (arguments.length < 1) {
                        return dataRouter.mapViewToApi($location.path());
                    }

                    // Setter
                    var path = dataRouter.mapApiToView(url);

                    if (path) {
                        $location.path(path);
                        return url;
                    }
                },

                /**
                 * Reloads data at current location. If content type remains same, only data are refreshed,
                 * and $routeDataUpdated event is invoked on routeData object. If content type differs,
                 * full view refresh is performed (that is, controller is destroyed and recreated).
                 * <p>
                 * If you refresh only data, it is recommended to use routeData object instead of $data injector,
                 * and you must listen to $routeDataUpdated event to catch the change.
                 *
                 * @param forceReload {boolean} If true, page is always refreshed (controller recreated). Otherwise only
                 *                              when needed.
                 */
                reload: function reload(forceReload) {
                    var path = $location.path() || '/';
                    var redirectTo;
                    var url;
                    var next = dataRouter.next = {};

                    // Home redirect
                    if ((redirectTo = provider.$redirects.match(path))) {
                        $log.debug("Redirecting to " + redirectTo);
                        $location.path(redirectTo).replace();
                        return;
                    }

                    // Load resource
                    url = dataRouter.mapViewToApi($location.path());
                    $log.debug("Loading resource " + url);

                    // Load data and view
                    $dataRouterLoader.loadData(url).then(function loadDataSuccess(response) {
                        // It is worth continuing?
                        if (dataRouter.next === next) {
                            // Check whether whole view needs to be refreshed
                            if (!forceReload && isSameView(dataRouter.current, response)) {
                                $log.debug("Replacing current data");

                                // Update current
                                dataRouter.next = undefined;
                                dataRouter.current = response;

                                // Update data
                                dataRouter.$$updateView(response);
                                $routeData.$emit('$routeDataUpdated', response.data);
                                return;
                            }

                            // Load view
                            return $dataRouterLoader.loadView(response);
                        }
                    }).then(showView, function loadError(response) {
                        // Error handler
                        if (dataRouter.next === next) {
                            // Load error view
                            response.mediaType = '$error';
                            response.view = $dataRouterRegistry.match('$error');

                            if (response.view) {
                                return $dataRouterLoader.loadView(response);
                            } else {
                                return $q.reject(response);
                            }
                        }
                    }).then(showView, function noErrorView(response) {
                        // Error handler
                        if (dataRouter.next === next) {
                            // Show error view
                            $log.error("Failed to load view or data and no error view defined", response);
                            $rootScope.$emit('$routeChangeFailed');
                        }
                    });

                    function showView(response) {
                        if (dataRouter.next === next) {
                            // Update current
                            dataRouter.next = undefined;
                            dataRouter.current = response;

                            // Show view
                            dataRouter.$$setView(response);
                        }
                    }

                    function isSameView(current, next) {
                        return current && next && current.url === next.url && current.mediaType === next.mediaType;
                    }
                },

                $$updateView: function $$updateView(response) {
                    $routeData.data = response.data;
                    $routeData.type = response.mediaType;
                    $routeData.url = response.config.url;
                    $routeData.headers = response.headers;
                },

                /**
                 * Performs the view reload.
                 *
                 * @param response {Object} Next view config.
                 */
                $$setView: function $$setView(response) {
                    $log.debug("Setting view to " + response.mediaType);

                    // Update view data
                    dataRouter.$$updateView(response);

                    // Emit event
                    $rootScope.$emit('$routeChangeSuccess');
                }
            };

            $rootScope.$on('$locationChangeSuccess', function () {
                dataRouter.reload(true);
            });

            return dataRouter;
        }];
    }]);

    module.directive('dataview', ["$dataRouter", "$anchorScroll", "$animate", function dataviewFactory($dataRouter, $anchorScroll, $animate) {
        return {
            restrict: 'ECA',
            terminal: true,
            priority: 400,
            transclude: 'element',
            link: function (scope, $element, attr, ctrl, $transclude) {
                var currentScope,
                    currentElement,
                    previousElement,
                    autoScrollExp = attr.autoscroll,
                    onloadExp = attr.onload || '';

                scope.$on('$routeChangeSuccess', update);
                update();

                function cleanupLastView() {
                    if (previousElement) {
                        previousElement.remove();
                        previousElement = null;
                    }
                    if (currentScope) {
                        currentScope.$destroy();
                        currentScope = null;
                    }
                    if (currentElement) {
                        $animate.leave(currentElement, function () {
                            previousElement = null;
                        });
                        previousElement = currentElement;
                        currentElement = null;
                    }
                }

                function update() {
                    var locals = $dataRouter.current && $dataRouter.current.locals,
                        template = locals && locals.$template;

                    if (angular.isDefined(template)) {
                        var newScope = scope.$new();
                        var current = $dataRouter.current;

                        // Note: This will also link all children of ng-view that were contained in the original
                        // html. If that content contains controllers, ... they could pollute/change the scope.
                        // However, using ng-view on an element with additional content does not make sense...
                        // Note: We can't remove them in the cloneAttchFn of $transclude as that
                        // function is called before linking the content, which would apply child
                        // directives to non existing elements.
                        currentElement = $transclude(newScope, function (clone) {
                            $animate.enter(clone, null, currentElement || $element, function onNgViewEnter() {
                                if (angular.isDefined(autoScrollExp) && (!autoScrollExp || scope.$eval(autoScrollExp))) {
                                    $anchorScroll();
                                }
                            });
                            cleanupLastView();
                        });

                        currentScope = current.scope = newScope;
                        currentScope.$emit('$viewContentLoaded');
                        currentScope.$eval(onloadExp);
                    } else {
                        cleanupLastView();
                    }
                }
            }
        };
    }]);

    module.directive('dataview', ["$compile", "$controller", "$dataRouter", function dataviewFillContentFactory($compile, $controller, $dataRouter) {
        // This directive is called during the $transclude call of the first `ngView` directive.
        // It will replace and compile the content of the element with the loaded template.
        // We need this directive so that the element content is already filled when
        // the link function of another directive on the same element as ngView
        // is called.
        return {
            restrict: 'ECA',
            priority: -400,
            link: function (scope, $element) {
                var current = $dataRouter.current;
                var view = current ? current.view : undefined;
                var locals = current.locals;

                $element.html(locals.$template);

                var link = $compile($element.contents());

                if (view && view.controller) {
                    locals.$scope = scope;
                    var controller = $controller(view.controller, locals);

                    if (view.controllerAs) {
                        scope[view.controllerAs] = controller;
                    }

                    $element.data('$ngControllerController', controller);
                    $element.children().data('$ngControllerController', controller);
                }

                if (view && view.dataAs) {
                    locals.$scope = scope;
                    scope[view.dataAs] = current.data;
                }

                link(scope);
            }
        };
    }]);

    /**
     * Collection of matchers, both exact and matcher functions.
     * @constructor
     */
    function DataRouterMatchMap() {
        this.$exact = {};
        this.$matchers = [];

        this.addMatcher = function (pattern, data) {
            if (angular.isFunction(pattern)) {
                this.$matchers.push({
                    m: pattern,
                    d: data
                });
            } else if (pattern.indexOf('*') > -1) {
                // Register matcher
                this.$matchers.push({
                    m: wildcardMatcherFactory(pattern),
                    d: data
                });
            } else {
                // Exact match
                this.$exact[pattern] = data;
            }
        };

        this.match = function (s) {
            // Exact match
            var data = this.$exact[s], i, matchers;
            if (data) return data;

            // Iterate matcher functions
            for (matchers = this.$matchers, i = 0; i < matchers.length; i++) {
                if (matchers[i].m(s)) {
                    return matchers[i].d;
                }
            }
        };
    }

    module.directive('apiHref', ["$dataRouter", "$dataRouterLoader", "$location", function ($dataRouter, $dataRouterLoader, $location) {
        return {
            restrict: 'AC',
            link: function (scope, element, attrs) {
                // Update href accordingly
                scope.$watch(attrs.apiHref, function (apiHref) {
                    var href = $dataRouter.mapApiToView(apiHref);

                    if (href) {
                        // Hashbang mode
                        if (!$location.$$html5) {
                            href = '#' + href;
                        }

                        attrs.$set('href', href);
                    } else {
                        attrs.$set('href', null);
                    }
                });

                // Don't watch for type if it is not defined at all
                if ('type' in attrs) {
                    element.click(function () {
                        if (attrs.type) {
                            scope.$applyAsync(function () {
                                $dataRouterLoader.prefetchTemplate(scope.$eval(attrs.type));
                            });
                        }
                    });
                }
            }
        };
    }]);

    module.constant('$$dataRouterMatchMap', {
        create: function create() {
            return new DataRouterMatchMap();
        }
    });

    // RouteError exception
    function RouteError(msg, status) {
        this.message = msg;
        this.status = status;
        this.stack = new Error().stack; // Includes ctor as well, byt better then nothing
    }

    RouteError.prototype = Object.create(Error.prototype);
    RouteError.prototype.name = 'RouteError';
    RouteError.prototype.constructor = RouteError;

    // Helper functions
    function joinUrl() {
        return Array.prototype.join.call(arguments, '/').replace(/\/+/g, '/');
    }

    function wildcardMatcherFactory(wildcard) {
        var pattern = new RegExp('^' + wildcardToRegex(wildcard) + '$');

        // Register matcher
        return function wildcardMatcher(s) {
            return pattern.test(s);
        };
    }

    function wildcardToRegex(s) {
        return s.replace(/([-()\[\]{}+?.$\^|,:#<!\\])/g, '\\$1').
            replace(/\x08/g, '\\x08').
            replace(/[*]+/, '.*');
    }

    function normalizeMediaType(mimeType) {
        if (!mimeType) return undefined;

        // Get rid of + end everything after
        mimeType = mimeType.replace(/\s*[\+;].*$/, '');

        // Prepend application/ if here is only subtype
        if (mimeType.indexOf('/') < 0) {
            mimeType = 'application/' + mimeType;
        }

        return mimeType;
    }
})(window.angular);
