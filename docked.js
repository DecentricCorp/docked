var express = require('express')
var app = express()

var dockerCLI = require('docker-cli-js')
var DockerOptions = dockerCLI.Options
var Docker = dockerCLI.Docker

var Git = require("nodegit")
var clone = require('nodegit-clone')

var rmdir = require('rmdir')

var docker = new Docker()
var containers


app.get('/v1/images', function (req, res) {
    docker.command('images').then(function(data){
        res.json(data.images)
    })
})

app.get('/v1/ps', function (req, res) {
    docker.command('ps').then(function (running) {
        res.json(running.containerList)
    })
})

app.get('/v1/logs/:id', function (req, res) {
    var id = req.params.id
    docker.command('logs ' + id + ' --tail 50').then(function (result) {
        res.json(result)
    })    
})

app.get('/v1/stop/:id', function (req, res) {
    var id = req.params.id
    docker.command('ps').then(function (running) {
        var match = running.containerList.filter(function(container){return container.image === id || container["container id"] === id})
        docker.command('stop ' + match[0]["container id"] ).then(function (result) {
            res.json(result)
        }) 
    })       
})

app.get('/v1/state/:id', function (req, res) {
    var id = req.params.id
    docker.command('ps').then(function (running) {
        var match = running.containerList.filter(function(container){return container.image === id || container["container id"] === id})
        docker.command('images').then(function (data) {
            var built = data.images.filter(function(image){return image.repository === id})
            res.json({online: match.length > 0, built: built.length > 0 })
        })        
    })
})

app.get('/v1/inspect/:id', function (req, res) {
    var id = req.params.id
    docker.command('inspect '+id).then(function (result) {
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
                console.log(dirs)
                console.log(files)
                console.log('all files are removed')
                console.log("err", err)
                clone({url: repoEndpoint, localPath: "repos/"+tag}).then(repo => {
                    docker.command('build -t '+tag+' repos/'+tag+'/.').then(function (data) {
                        res.json({success: true, image: data})
                    })
                })
            })            
        }
    }
})

app.get('/v1/help', function (req, res) {
    docker.command('run --help').then(function (result) {
        res.json(result)
    })
})

//http://localhost:4100/v1/run/1098cfbd5ed6/-d/3027
app.get('/v1/run/:id/:flags*?/:ports*?', function (req, res) {
    var id = req.params.id
    docker.command('inspect '+ id).then(function(image){
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
        console.log(cmd)
        docker.command(cmd).then(function (result) {
            res.json({cmd: cmd, result: result})
        })
    })
})


function listAndClose() {
    docker.command('ps').then(function (running) {
        containers = running.containerList
    }).then(function(){
        containers.forEach(function(container){
            docker.command("kill "+container["container id"]).then(function(data){
                console.log("killed", container["container id"], data)
            })
        })
    })
}

var port = process.argv[2] || process.env.PORT || 4100
global.app = app

// Only run when application is executed
// Don't run in tests, where application is imported
if (!module.parent) {
    console.log('API running at http://localhost:' + port)
    app.listen(port)
}



module.exports = app
