const API_PORT = 3000;
const mongoose = require('mongoose');
const Joi = require('joi');
const express = require('express');
const app = express();
app.use(express.json());
app.listen(API_PORT, () => console.log('Listening on port ' + API_PORT + '...'));


mongoose.connect('mongodb://127.0.0.1:27017/tasksdb', { useNewUrlParser: true})
.then(() => console.log('Connected to MongoDB!'))
.catch(error => console.error('Could not connect to MongoDB...', error));

/**
 * SCHEMA
 */

const taskSchema = new mongoose.Schema({
  text: String,
  fieldIDs: [ mongoose.Schema.Types.ObjectId ],
  isDone: Boolean,
  deadline: {
    type: Date,
    default: Date.now
  }
});

const fieldSchema = new mongoose.Schema({
  text: String,
  priority: Number
});

const Task = mongoose.model('Task', taskSchema);
const Field = mongoose.model("Field", fieldSchema);

/**
 * VALIDATE
 */

function validateTask(task, required = true) {
  const schema = Joi.object({
    text:               Joi.string().min(3),
    fieldIDs:           Joi.array(),
    isDone:             Joi.bool()
  });

  return schema.validate(task, { presence: (required) ? "required" : "optional" });
}

function validateField(field, required = true) {
  const schema = Joi.object({
    text:              Joi.string().min(3),
    priority:          Joi.number()
  });
  return schema.validate(field, { presence: (required) ? "required" : "optional"});
}

function validateGet(getData)
{
  const schema = Joi.object({
    text:        Joi.string().min(3),
    limit:      Joi.number().min(1),
    fieldID:   Joi.string().min(5),
    priority:     Joi.number(),
    isDone:    Joi.bool()
  });
  return schema.validate(getData, { presence: "optional" });
}

// Naše metoda validateGet() nám v budoucnu poslouží pro
// ověření parametrů, které se mohou nacházet v GET
// požadavku. Nestane se nám pak, že např. funkci limit() pošleme
// String, který není číslo, a aplikace vyvolá neošetřenou
// výjimku.

/**
 * GET
 */

app.get('/api/tasks', (req, res) => {       //promise
  const { error } = validateGet(req.query);

  if (error)
  {
    res.status(404).send(error.details[0].message);
    return;
  }

  let dbQuery = Task.find();
  if (req.query.text)
    dbQuery = dbQuery.where("text", req.query.text);

  if (req.query.fieldID)
    dbQuery = dbQuery.where("fieldIDs", req.query.fieldID);

  if (req.query.isDone)
    dbQuery = dbQuery.where("isDone", req.query.isDone);

  if (req.query.limit)
    dbQuery = dbQuery.limit(parseInt(req.query.limit));

  dbQuery
      .then(tasks => { res.json(tasks) })
      .catch(err => { res.status(400).send("Požadavek na úkoly selhal!"); });

});

async function getTaskByID(id) {
  let task = await Task.findById(id);
  if (task) {
    task = task.toJSON();
    let fields = await Field.find().where("_id").in(task.fieldIDs).select("_id text");
    task.fields = JSON.parse(JSON.stringify(fields));
  }
  return task;
}


app.get('/api/tasks/:id', (req, res) => {    //callback
  getTaskByID(req.params.id)
      .then( task => {
        if (task)
          res.send(task);
        else
          res.status(404).send("Úloha nebyla nalezena.");
      })
      .catch(err => { res.status(400).send("Chyba požadavku GET na film!") });
});

app.get('/api/fields', (req, res) => {
  const { error } = validateGet(req.query);
  if (error)
  {
    res.status(400).send(error.details[0].message);
    return;
  }

  let dbQuery = Field.find();

  if (req.query.limit)
    dbQuery = dbQuery.limit(parseInt(req.query.limit));

  dbQuery.then(fields => { res.json(fields); })
      .catch(err => { res.status(400).send("Chyba požadavku na oblasti!"); });
});

app.get('/api/fields/:id', (req, res) => {
  Field.findById(req.params.id, (err, person) => {
    if (err)
      res.status(404).send("Oblast s daným ID nebyla nalezen.");
    else
      res.json(person);
  });
});

/**
 * POST
 */

app.post('/api/fields', (req, res) => {
  const { error } = validateField(req.body);
  if (error) {
    res.status(400).send(error.details[0].message);
  } else {
    Field.create(req.body)
        .then(result => { res.json(result) })
        .catch(err => { res.send("Nepodařilo se uložit kategorii!")} );
  }
});

app.post('/api/tasks', (req, res) => {
  const { error } = validateTask(req.body);
  if (error) {
    res.status(400).send(error.details[0].message);
  } else {
    Task.create(req.body)
        .then(result => { res.json(result) })
        .catch(err => { res.send("Nepodařilo se uložit úkol!") });
  }
});

/**
 * DELETE
 */

app.delete('/api/tasks/:id', (req, res) => {
  Task.findByIdAndDelete(req.params.id)
      .then(result => {
        if (result)
          res.json(result);
        else
          res.status(404).send("Úkol s daným id nebyl nalezen!");
      })
      .catch(err => { res.send("Chyba při mazání úkolu!") });
});

app.delete('/api/fields/:id', (req, res) => {
  Task.find({ fieldIDs: req.params.id }).countDocuments()
      .then(count => {
        if (count != 0)
          res.status(400).send("Nelze smazat kategorii, která je přiřazena k alespoň jednomu úkolu!")
        else
        {
          Field.findByIdAndDelete(req.params.id)
              .then(result => { res.json(result) })
              .catch(err => { res.send("Nepodařilo se smazat kategorii!") });
        }
      }).catch(err => { res.status(400).send("Nepodařilo se smazat kategorii!") });
});


/**
 * PUT
 */

app.put('/api/tasks/:id', (req, res) => {
  const { error } = validateTask(req.body, false);
  if (error) {
    res.status(400).send(error.details[0].message);
  } else {
    Task.findByIdAndUpdate(req.params.id, req.body, { new: true })
        .then(result => { res.json(result) })
        .catch(err => { res.send("Nepodařilo se uložit úkol!") });
  }
});

app.put('/api/fields/:id', (req, res) => {
  const { error } = validateField(req.body, false);
  if (error) {
    res.status(400).send(error.details[0].message);
  } else {
    Field.findByIdAndUpdate(req.params.id, req.body, { new: true })
        .then(result => { res.json(result) })
        .catch(err => { res.send("Nepodařilo se uložit oblast!") });
  }
});


