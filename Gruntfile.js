module.exports = function (grunt) {
    // Load tasks
    require('load-grunt-tasks')(grunt, {scope: 'devDependencies'});

    // Project configuration.
    grunt.initConfig({
        pkg: require('./package.json'),
        cfg: {
            src: 'src',
            demo: 'demo',
            build: 'build',
            dist: 'dist',
            docs: 'docs',
            bower: 'bower_components'
        },
        clean: {
            build: ['<%=cfg.build%>'],
            dist: ['<%=cfg.dist%>', '<%=cfg.docs%>'],
            docs: ['<%=cfg.docs%>'],
            tmp: ['<%=cfg.build%>/router.js', '<%=cfg.build%>/api.js']
        },

        // Validate
        jshint: {
            options: {
                undef: true,
                unused: 'vars',
                nonew: true,
                nonbsp: true,
                bitwise: true
            },
            grunt: {
                options: {
                    node: true
                },
                files: {
                    src: ['Gruntfile.js']
                }
            },
            src: {
                options: {
                    browser: true,
                    sub: true,
                    globalstrict: true,

                    globals: {
                        angular: true,
                        module: true
                    }
                },
                files: {
                    src: ['<%=cfg.src%>/**/*.js', '!<%=cfg.src%>/module.js', '!<%=cfg.src%>/**/*.spec.js']
                }
            },
            bundle: {
                options: {
                    browser: true,
                    sub: true,

                    globals: {
                        angular: true
                    }
                },
                files: {
                    src: ['<%=cfg.build%>/dist/angular-data-router.js']
                }
            },
            demo: {
                options: {
                    browser: true,
                    sub: true,

                    globals: {
                        angular: true
                    }
                },
                files: {
                    src: ['<%=cfg.demo%>/**/*.js']
                }
            },
            test: {
                options: {
                    browser: true,
                    sub: true,
                    globalstrict: true,
                    globals: {
                        angular: true,
                        describe: true,
                        it: true,
                        beforeEach: true,
                        expect: true,
                        module: true,
                        inject: true,
                        spyOn: true
                    }
                },
                files: {
                    src: ['<%=cfg.src%>/**/*.spec.js']
                }
            }
        },

        // Compile
        concat: {
            options: {
                banner: '/**\n * @license angular-data-router v<%=pkg.version%>\n * (c) 2015 Michal Dvorak https://github.com/mdvorak/angular-data-router\n * License: MIT\n */'
            },
            router: {
                options: {
                    get banner() {
                        var module = grunt.file.read('src/module.js');
                        return '<%=concat.options.banner%>\n(function dataRouterModule(angular) {\n' + module + '\n';
                    },
                    footer: '\n})(angular);',
                    process: function (src) {
                        return src.replace(/(^|\n)[ \t]*('use strict'|"use strict");?\s*/g, '$1');
                    }
                },
                files: [{
                    dest: '<%=cfg.build%>/router.js',
                    src: [
                        '<%=cfg.src%>/dataRouterRegistry.js',
                        '<%=cfg.src%>/dataRouterLoader.js',
                        '<%=cfg.src%>/dataRouter.js',
                        '<%=cfg.src%>/matchMap.js',
                        '<%=cfg.src%>/eventSupport.js',
                        '<%=cfg.src%>/directives/**/*.js',
                        '<%=cfg.src%>/dataApi.js',
                        '!<%=cfg.src%>/**/*.spec.js'
                    ]
                }]
            },
            api: {
                options: {
                    banner: '<%=concat.options.banner%>\n(function dataApiModule(angular) {\n"use strict";\n',
                    footer: '\n})(angular);',
                    process: function (src) {
                        return src.replace(/(^|\n)[ \t]*('use strict'|"use strict");?\s*/g, '$1');
                    }
                },
                files: [{
                    dest: '<%=cfg.build%>/api.js',
                    src: ['<%=cfg.src%>/dataApi.js', '!<%=cfg.src%>/**/*.spec.js']
                }]
            }
        },

        ngAnnotate: {
            build: {
                files: [
                    {
                        '<%=cfg.build%>/dist/angular-data-router.js': '<%=cfg.build%>/router.js',
                        '<%=cfg.build%>/dist/components/data-api.js': '<%=cfg.build%>/api.js'
                    }
                ]
            }
        },

        jsbeautifier: {
            options: {
                jslintHappy: true
            },
            build: {
                src: [
                    '<%=cfg.build%>/dist/angular-data-router.js',
                    '<%=cfg.build%>/dist/components/*.js'
                ]
            }
        },

        uglify: {
            build: {
                options: {
                    banner: '/*\n angular-data-router v<%=pkg.version%>\n (c) 2015 Michal Dvorak https://github.com/mdvorak/angular-data-router\n License: MIT\n*/',
                    sourceMap: true
                },
                files: [{
                    expand: true,
                    src: ['<%=cfg.build%>/dist/**/*.js'],
                    ext: '.min.js'
                }]
            }
        },

        // Tests
        karma: {
            options: {
                frameworks: ['detectBrowsers', 'jasmine'],
                singleRun: true,
                files: [
                    // Libraries
                    '<%=cfg.bower%>/angular/angular.js',
                    '<%=cfg.bower%>/angular-mocks/angular-mocks.js',

                    // Application files
                    '<%=cfg.build%>/dist/angular-data-router.js',

                    // Tests
                    '<%=cfg.src%>/**/*.spec.js'
                ]
            },
            default: {},
            debug: {
                options: {
                    singleRun: false,
                    browsers: ['Chrome']
                }
            }
        },

        // Release
        copy: {
            dist: {
                files: [{
                    expand: true,
                    cwd: '<%=cfg.build%>/dist',
                    dest: '<%=cfg.dist%>',
                    src: ['**']
                }]
            }
        },
        gitadd: {
            dist: {
                options: {
                    all: true
                },
                files: {
                    src: [
                        '<%=cfg.dist%>/**'
                    ]
                }
            }
        },
        bump: {
            options: {
                pushTo: 'origin',
                commitMessage: '[release v%VERSION%]',
                commitFiles: ['package.json', 'dist/**']
            }
        },

        // Docs
        ngdocs: {
            options: {
                dest: 'docs',
                html5Mode: false,
                scripts: [
                    'https://ajax.googleapis.com/ajax/libs/angularjs/1.3.11/angular.min.js',
                    'https://ajax.googleapis.com/ajax/libs/angularjs/1.3.11/angular-animate.min.js',
                    '<%=cfg.build%>/dist/angular-data-router.js'
                ]
            },
            api: {
                src: [
                    '<%=cfg.build%>/dist/angular-data-router.js',
                    '<%=cfg.src%>/docs/**/*.js'
                ],
                title: 'Angular Data Router Documentation'
            }
        },
        'gh-pages': {
            options: {
                base: 'docs'
            },
            src: ['**']
        },

        // Demo
        connect: {
            server: {
                options: {
                    hostname: 'localhost',
                    port: 9000
                }
            }
        },
        watch: {
            src: {
                files: ['<%=cfg.src%>/**/*.js'],
                tasks: ['javascript', 'jshint:test', 'ngdocs']
            },
            demo: {
                files: ['<%=cfg.demo%>/**/*.js'],
                tasks: ['jshint:demo']
            }
        }
    });

    // Private tasks
    grunt.registerTask('javascript', ['jshint:src', 'concat:router', 'concat:api', 'ngAnnotate:build', 'jshint:bundle', 'jsbeautifier:build', 'uglify:build', 'clean:tmp']);

    // Public tasks
    grunt.registerTask('default', ['jshint:grunt', 'clean:build', 'javascript', 'jshint:test', 'karma:default']);
    grunt.registerTask('debug', ['karma:debug']);
    grunt.registerTask('demo', ['jshint:demo', 'default', 'connect:server', 'watch']);

    grunt.registerTask('docs', ['jshint:grunt', 'clean:build', 'clean:docs', 'javascript', 'ngdocs', 'gh-pages']);
    grunt.registerTask('dist', ['default', 'clean:dist', 'copy:dist']);
    grunt.registerTask('release', ['git-is-clean', 'bump-only', 'dist', 'gitadd:dist', 'bump-commit', 'git-is-clean']);
};
