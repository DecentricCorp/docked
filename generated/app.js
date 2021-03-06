/* 
 * Dependencies
 */
var express = require('express'),
  path = require('path'),
  fs = require('fs'),
  http = require('http'),
  exphbs = require('express3-handlebars'),
  lessMiddleware = require('less-middleware'),
  dockerCLI = require('./cli.js'),
  Docker = dockerCLI.Docker,
  docker = new Docker({}, ""),
  context = "docker ",
  Git = require("nodegit"),
  clone = require('nodegit-clone'),
  rmdir = require('rmdir')
/*
 * Initiate Express
 */
var app = express();


/* 
 * App Configurations
 */
app.configure(function() {
  app.set('port', process.env.PORT || 4100);

  app.set('views', __dirname + '/views');

  app.set('view engine', 'html');
  app.engine('html', exphbs({
    defaultLayout: 'main',
    extname: '.html'
    //helpers: helpers
  }));
  app.enable('view cache');
  app.use(contextCheck)
  app.use(lessMiddleware({
    src: __dirname + '/public',
    compress: true,
    sourceMap: true
  }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.use(express.bodyParser());
  app.use(express.favicon());
  app.use(express.logger('dev')); 
  app.use(express.methodOverride());
  app.use(app.router)
})

function contextCheck(req, res, next){
  console.log("________----HERE----_______")
    var ctx = req.query.context
    if (ctx) {
        context = ctx + " "
        if (ctx === "bluemix") {
            context = "cf ic"
        }        
    }
    next()
}

app.configure('development', function(){
  app.use(express.errorHandler());
});

/*
* Route for Index
*/
app.get('/', function(req, res) {
  res.render('index');
});


/*
 * Routes for API
 */
app.use(contextCheck)
function contextCheck(req, res, next){
    var ctx = req.query.context
    if (ctx) {
        context = ctx + " "
        if (ctx === "bluemix") {
            context = "cf ic"
        }        
    }
    next()
}

app.get('/v1/group/list', function(req, res){
    docker.command({command: 'group list', type: context}).then(function(data){
        res.json(data)
    })
})

app.get('/v1/images', function (req, res) {
    docker.command({command: 'images', type: context}).then(function(data){
        res.json(data.images)
    })
})

app.get('/v1/ps', function (req, res) {
    docker.command({command: 'ps', type: context}).then(function (running) {
        res.json(running)
    })
})

app.get('/v1/logs/:id', function (req, res) {
    var id = req.params.id
    docker.command({command: 'logs ' + id + ' --tail 50', type: context}).then(function (result) {
        res.json(result)
    })    
})

app.get('/v1/stop/:id', function (req, res) {
    var id = req.params.id
    docker.command({command: 'ps', type: context}).then(function (running) {
        var match = running.containerList.filter(function(container){return container.image === id || container["container id"] === id})
        docker.command({command: 'stop ' + match[0]["container id"] }).then(function (result) {
            res.json(result)
        }) 
    })       
})

app.get('/v1/state/:id', function (req, res) {
    var id = req.params.id
    docker.command({command: 'ps', type: context}).then(function (running) {
        var match = running.containerList.filter(function(container){return container.image === id || container["container id"] === id})
        docker.command({command: 'images', type: context}).then(function (data) {
            var built = data.images.filter(function(image){return image.repository === id})
            res.json({online: match.length > 0, built: built.length > 0 })
        })        
    })
})

app.get('/v1/inspect/:id', function (req, res) {
    var id = req.params.id
    docker.command({command: 'inspect '+id, type: context}).then(function (result) {
        res.json(result.object)
    })
})

//http://localhost:4100/v1/build/git/github.com/DecentricCorp/insight-coval.git
app.get('/v1/build/:method/:location/:org/:repo/:tag*?', function (req, res) {
    console.log("params", req.params)
    var method = req.params.method
    var location = req.params.location
    var org = req.params.org
    var repo = req.params.repo
    var tag = req.params.tag || repo.replace(".git", "")
    if (method !== "git") {
        res.json({error: method + " method not supported."})
    } else {
        if (!location) {
            res.json({error: "A location is required for git method"})
        } else {
            var repoEndpoint = method + "://" + location + "/" + org + "/" + repo
            rmdir("repos/"+tag+'/', function (err, dirs, files) {
                clone({url: repoEndpoint, localPath: "repos/"+tag}).then(repo => {
                    docker.command({command: 'build -t '+tag+' repos/'+tag+'/.', type: context}).then(function (data) {
                        res.json({success: true, image: data})
                    })
                })
            })            
        }
    }
})

app.get('/v1/help', function (req, res) {
    docker.command({command: 'run --help', type: context}).then(function (result) {
        res.json(result)
    })
})

app.get('/v1/orgs', function (req, res) {
    docker.command({command: 'orgs', "type": 'cf'}).then(function (result) {
        res.json(result)
    })
})

app.get('/v1/org/:orgName', function (req, res) {
    var orgName = req.params.orgName
    docker.command({command: 'org '+orgName, "type": 'cf'}).then(function (result) {
        res.json(result)
    })
})

app.get('/v1/spaces', function (req, res) {
    docker.command({command: 'spaces ', "type": 'cf'}).then(function (result) {
        res.json(result)
    })
})

app.get('/v1/target', function (req, res) {
    var target = makeTargetCommand(req)
    docker.command({command: 'target '+target, "type": 'cf'}).then(function (result) {
        res.json(result)
    })
})
app.get('/v1/target/:org', function (req, res) {
    var target = makeTargetCommand(req)
    docker.command({command: 'target '+target, "type": 'cf'}).then(function (result) {
        res.json(result)
    })
})
app.get('/v1/target/:org/:space', function (req, res) {
    var target = makeTargetCommand(req)
    docker.command({command: 'target '+target, "type": 'cf'}).then(function (result) {
        res.json(result)
    })
})
function makeTargetCommand(req) {
  var org = req.params.org
  var space = req.params.space || req.query.space
  var target = ""
  if (org) {
      target = target + " -o "+ org
  }
  if (space) {
      target = target + " -s "+ space
  }
  return target
}

//http://localhost:4100/v1/run/1098cfbd5ed6/-d/3027
app.get('/v1/run/:id/:flags*?/:ports*?', function (req, res) {
    var id = req.params.id
    docker.command({command: 'inspect '+ id, type: context}).then(function(image){
        var flags = req.params.flags || "-d"
        var portFlags = ""
        var ports = req.params.ports
        if (ports) {    
            ports.forEach(function(port){
                if (port.indexOf(":") > -1) {
                    portFlags = portFlags + "-p " + port + " "
                } else {
                    portFlags = portFlags + "-p " + port + ":" + port + " "
                }
            })
        } else {
            ports = image.object[0].Config.ExposedPorts
            Object.keys(ports).forEach(function(key) {
                var port = key.split("/")[0]
                portFlags = portFlags + "-p " + port + ":" + port + " "
            })
        }
        var cmd = 'run ' + flags + ' ' + portFlags + ' ' + id
        console.log({command: cmd, type: context})
        docker.command(cmd).then(function (result) {
            res.json({cmd: cmd, result: result})
        })
    })
})


/*
 * Routes for Robots/404
 */
app.get('/robots.txt', function(req, res) {
  fs.readFile(__dirname + "/robots.txt", function(err, data) {
    res.header('Content-Type', 'text/plain');
    res.send(data);
  });
});

app.get('*', function(req, res) {
  res.render('404');
});


http.createServer(app).listen(app.get('port'), function() {
  console.log("Express server listening on port " + app.get('port'));
});
