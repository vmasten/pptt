'use strict';

require('dotenv').config();
const pg = require('pg');
const express = require('express');
const PORT = process.env.PORT;
const app = express();
const client = new pg.Client(process.env.DATABASE_URL);
const superagent = require('superagent');
const startOfString = 'https://api.github.com/repos/';
client.connect();



// Additional requirements for utilizing node-html-pdf
const fs = require('fs');
const pdf = require('html-pdf');
var options = {
  format : 'Letter',
  base : 'http://p2t2.herokuapp.com/' };
const ejs = require('ejs');
// End of additional requirements for node-html-pdf

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('./public'));
app.post('/form/complete', githubPostToBase);
app.get('/form', initializeFormPage);
app.get('/dashboard/:id', initializeDashboardPage);
app.post('/dashboard/:id', testBump);
app.get('/about', initializeAboutPage);
app.get('/', initializeHomePage);

function initializeHomePage(req,res){
  let SQL = `
  SELECT id, collaborators, name, description 
  FROM projects;`;
  client.query(SQL)
    .then(result => {
      let cardbase = result.rows;
      res.render('pages/main', {cardbase});
    });
}

function initializeFormPage(req, res) {
  res.render('pages/form');
}

function testBump(req,res){
  let SQL = 'INSERT INTO events(project_id,title,start,"end",description) VALUES($1,$2,$3,$4,$5);';
  let values = [req.body.project_id, req.body.name, req.body.start, req.body.end,req.body.description];
  client.query(SQL, values)
    .then(() => {
      res.redirect(`/dashboard/${req.body.project_id}`);
    });
}

function initializeDashboardPage(req, res) {
  let SQL = `SELECT name, repo_url FROM projects
  WHERE id=$1;`;
  let id = req.params.id;
  let values = [req.params.id];
  let SQLcal= 'SELECT title, start, "end", description FROM events WHERE project_id=$1;';
  Promise.all([
    client.query(SQL, values),
    client.query(SQLcal, values),
  ]) .then(([projectsData, eventsData]) => {
    let project = projectsData.rows[0];
    let eventList = eventsData.rows;
    let splitHubUser = project.repo_url.split('/')[3];
    let splitHubRepo = project.repo_url.split('/')[4];
    let conString = `${startOfString}${splitHubUser}/${splitHubRepo}`;
    Promise.all([
      superagent.get(`${conString}/issues`),
      superagent.get(`${conString}/commits`),
    ]).then(([issues, commits]) => {
      let latestIssue = issues.body.slice(0,5);
      let latestCommit = commits.body.slice(0,5);
      res.render('pages/dashboard', { latestIssue, latestCommit, eventList, id});
    });
  });
}

function initializeAboutPage(req, res) {
  res.render('pages/about');
}

function githubPostToBase(req, res) {
  let SQL = `
    INSERT INTO projects(collaborators ,name, startdate, enddate, repo_url, description)
    VALUES ($1, $2, $3, $4, $5, $6);`;
  let values = [
    req.body.collaborators,
    req.body.project_name,
    req.body.start_date,
    req.body.due_date,
    req.body.github_repo,
    req.body.description];
  client.query(SQL, values);
  res.render('pages/success');
}

app.use(express.static(__dirname + '/public'));
app.use('*', (req, res) => res.render('pages/error'));
app.listen(PORT, () => console.log(`server hath started on port ${PORT}`));

// Create a PDF file function
function makePDF(req, res) {
  let SQL = `SELECT name, repo_url FROM projects
              WHERE id=1;`;
  client.query(SQL)
    .then (result => {
      let project = result.rows[0];
      let splitHubUser = project.repo_url.split('/')[3];
      let splitHubRepo = project.repo_url.split('/')[4];
      let conString = `${startOfString}${splitHubUser}/${splitHubRepo}/issues`;
      superagent.get(conString)
        .then(data => {
          let latestIssue = data.body.slice(0, 4);
          let html;
          ejs.renderFile('./views/pages/dashboard.ejs', {latestIssue}, function(err, res) {
            if(res) {
              html = res;
              console.log(html);
            }
            else {
              console.log(err);
            }
          });
          pdf.create(html, options).toFile(function(err, res) {
            if (err) return console.log(err);
            console.log(res);
          });
        });
    });
}