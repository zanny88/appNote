const express = require("express");
const app = express();
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const { type } = require("os");
const bodyParser = require("body-parser");

app.use(cors());
app.set("view engine");
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname,"public")));

const mongoDBUri = "mongodb+srv://marcostignani9:qpalzmQP8@clusternote.yd03buh.mongodb.net/?retryWrites=true&w=majority&appName=ClusterNote";
mongoose.connect(mongoDBUri, { useNewUrlParser: true, useUnifiedTopology: true });

app.use(bodyParser.json());

const noteSchema = new mongoose.Schema ({
    user: String,
    public: Boolean,
    heading: String,
    content: String,
    date: {type: Date, default: Date.now()},
    place: String,
    tags: [String],
    todo_children: {type: [String], default: []},//array dove salvare gli id dei to-do creati nel corpo della nota per eventuali modifiche
    el_type: {type: String, default: "notes"}
});

const todoSchema = new mongoose.Schema({
    parent_id: String,//id della nota da cui è stato creato il to-do 
    user: String,
    public: Boolean,
    heading: String,
    tasks: [String],
    date: {type: Date, default: Date.now()},
    completed: [Boolean],
    place: String,
    tags: [String],
    el_type: {type: String, default: "Todo"}
});

const sessionSchema = new mongoose.Schema({
    user: String,
    startSession: {type: Date, default: Date(new Date().getTime())},
    replayable: {type: Boolean, default: false},
    studyTime: Number,
    pauseTime: Number,
    cicles: Number,
    inactiveTime: {type: Number, default: 0},
    state: {type: String, default: "Study"}
});

const userSchema = new mongoose.Schema({/*!!!!!!!!!!!!!!!!!*/
    name: String,
    passw: String,
    friends: {type: [String], default: []},
    inbox: {type: [String], default: []}
});

const Note = mongoose.model("Note",noteSchema);
const Todo = mongoose.model("Todo",todoSchema);
const User = mongoose.model("User",userSchema);/*!!!!!!!!!!!*/
const Session = mongoose.model("Session",sessionSchema);

var currentUser = null;

//gestione richiesta post per richiedere un preciso to-do o una precisa nota inviando l'ID
app.post("/:blogType/get",async (req,res) => {
    var {ID} = req.body;
    var todo, note;
    try{
        if(req.params.blogType == "todos"){
            todo = await Todo.find({_id: ID});
            res.send(todo);
        }else{
            note = await Note.find({_id: ID});
            res.send(note);
        }
    }catch(error){
        res.status(404).send("Element not found");
    }

});

//gestione richiesta post per richiedere un numero di note (con limit = -1 si ottengono tutte le note) 
app.post("/getNotes/:limit", async (req,res) => {
    var lim = Number(req.params.limit);
    var note;
    if(lim > 0){
        note = await Note.find({user: currentUser.name}).limit(lim);
    }else{
        note = await Note.find({user: currentUser.name});
    }
    res.send(note);
});

//gestione richiesta post per richiedere un numero di to-do (con limit = -1 si ottengono tutti i to-do)
app.post("/getTodos/:limit", async (req,res) => {
    var lim = Number(req.params.limit);
    var todo;
    if(lim > 0){
        todo = await Todo.find({user: currentUser.name}).limit(req.params.limit);
    }else{
        todo = await Todo.find({user: currentUser.name});
    }
    res.send(todo);
});

//gestione richiesta post per aggiungere o modificare note e to-do
app.post("/compose",async (req,res) => {
    const {ID,parent_id,heading, content, tags, place, public,post_type,todo_children} = req.body;
    var savedDocument;

    //la tipologia del post viene riconosciuta con il valore di post_type (0 per le note e 1 per i to-do)
    if(post_type == 0){
        //se il parametro ID è != da null viene gestita una richiesta di modifica della nota
        //viene quindi cercata e modificata
        //altrimenti viene crata una nuova nota
        if(ID != null){
            try{
                var note = await Note.findOne({_id: ID});

                note.heading = heading;
                note.content = content;
                note.place = place;
                note.public = public;
                note.tags = tags.split(",").map(tag => tag.trim()).filter(item => item != "");

            }catch(error){
                console.log("Error fetching note to modify: ",error);
            }
        }else{
            var newNote = new Note({
                user: currentUser.name,
                public: public,
                heading: heading,
                content: content,
                place: place,
                tags: tags.split(',').map(tag => tag.trim())
            });
        }
    }else{
        //modifica o creazione dei to-do gestita ugualmente a quella delle note
        //con le opportune differenze per la gestione dei campi per i to-do
        //ovvero separazione dei task e la gestione dei task completati
        if(ID != null){
            console.log(`modifico il to-do con ID: ${ID}`);
            try{
                var todo = await Todo.findOne({_id: ID});
                console.log(`to-do trovato: ${todo}`);

                todo.heading = heading;
                var newTasks = content.split("\n").map(task => task.trim()).filter(item => item != "");
                var oldComp = [];
                var newComp = [];
                for(let i=0;i<todo.completed.length;i++){
                    if(todo.completed[i]){
                        oldComp.push(i);
                    }
                }
                oldComp.forEach(index => {
                    if(newTasks.includes(todo.tasks[index])){
                        newComp.push(newTasks.indexOf(todo.tasks[index]));
                    }
                });
                todo.tasks = newTasks;
                todo.completed = [];
                for(let i=0;i<todo.tasks.length;i++){
                    todo.completed.push(newComp.includes(i));
                }
                todo.place = place;
                todo.tags = tags.split(",").map(tag => tag.trim()).filter(item => item != "");
                todo.public = public;

            }catch(error){
                console.log("Error while fetching to-do: ",error);
            }
        }else{
            var newTodo = new Todo({
                parent_id: parent_id,
                user: currentUser.name,
                public: public,
                heading: heading,
                tasks: content.split("\n").map(task => task.trim()).filter(item => item !== ""),
                completed: Array(content.split("\n").length).fill(false),
                place: place,
                tags: tags.split(",").map(tag => tag.trim())
            });
        }
    }

    try{
        //divisione del salvataggio sempre in base al tipo di post da salvare
        if(post_type == 0){
            //ulteriore divisione per la modifica e la creazione delle note
            if(ID != null){
                savedDocument = await note.save();
                //nel caso della modifica di una nota nella risposta da parte del server viene inviata anche la lista degli ID dei to-do creati dentro alla nota
                //insieme anche all'ID della nota appena modificata
                //!!!NOTA!!! --> NON FUNZIONA
                if(savedDocument.t_child.length > 0){
                    res.json({
                        message: "Modify todo children",
                        t_child: savedDocument.todo_children,
                        parent_id: savedDocument._id
                    });
                }
            }else{
                savedDocument = await newNote.save();
            }
            //se la richiesta era per la creazione di una nuova nota allora nella risposta dal server viene aggiunto l'ID della nota appena creata 
            //servirà durante la creazione dei to-do (se presenti)
            if(todo_children){
                res.json({
                    message: "Add todo children",
                    id: savedDocument._id
                });
            }
        }else{
            //uguale divisione per creazione e modifica
            if(ID != null){
                savedDocument = await todo.save();
            }else{
                savedDocument = await newTodo.save();
                //se il nuovo to-do è stato creato a partire da una nota viene salvato all'interno del to-do l'ID del padre
                if(parent_id){
                    var p_nota = await Note.findById(parent_id);
                    p_nota.todo_children.push(savedDocument._id);
                    p_nota.save();
                }
                res.json({message: "fine"});
            }
        }        
    }catch(error){
        console.log(error);
        res.status(500).send("Error saving Note");
    }
    
});

//gestione richiesta post per contrassegnare un task come completato
//viene cercato il to-do e modificato il valore all'indice corrispondente del task nell'array completed
//l'ID del to-do e l'indice del task vengono passati come payload alla richiesta
app.post("/todos/tasks/check",async (req,res) => {
    const {todo_id,task_index} = req.body;
    try{
        var r = await Todo.findById(todo_id);
        if(!r){
            res.status(404).send("Todo not found");
        }
        var comp = r.completed;
        comp[task_index] = true;
        await Todo.findByIdAndUpdate({_id: todo_id},{completed: comp});
        res.json({message: "OK"});
    }catch(error){
        console.log("Error: ",error);
        res.status(500).send("Error while fetching todo");
    }
});

//gestione richiesta post per la cancellazione di un task
//viene cercato il to-do e vengono eliminati dagli array tasks e completed i valori all'indice del task
//l'ID del to-do e l'indice del task vengono passati come payload alla richiesta
app.post("/todos/tasks/delete",async (req,res) => {
    const {todo_id,task_index} = req.body;
    try{
        var r = await Todo.findById(todo_id);
        if(!r){
            res.status(404).send("Todo not found");
        }
        r.tasks.splice(task_index,1);
        r.completed.splice(task_index,1);

        await Todo.findOneAndUpdate({_id: todo_id},{tasks: r.tasks, completed: r.completed});
        res.send({message: "OK"});
    }catch(error){
        res.status(500).send("Error while fetching todo");
    }
});

//gestione richiesta post per la cancellazione di un post
app.post("/:blogType/delete",async (req,res) => {
    var r;
    //l'ID del post viene passato come payload 
    const {ID} = req.body;
    try{
        //la tipologia del post viene passata all'interno dell'URL della richiesta
        if(req.params.blogType == "Notes"){
            r = await Note.findByIdAndDelete(ID);
        }else{
            r = await Todo.findByIdAndDelete(ID);
        }
        if(!r){
            return res.status(404).send("Element not found");
        }
        res.send("OK");
    }catch(error){
        console.log("ERRORE: ",error);
        res.status(500).send("Error deleting element");
    }
});

//gestione richiesta post per la duplicazione di una nota
//la nota viene cercata e viene poi creata una nuova nota utilizzando i valori di quella già presente
//l'ID della nota viene passato nell'URL della richiesta
app.post("/duplicateNote/:id",async (req,res) => {
    try{
        var n = await Note.findById(req.params.id);
        if(!n){
            return res.status(404).send("Element not found");
        }

        var note = new Note({
            user: n.user,
            public: n.public,
            heading: n.heading,
            content: n.content,
            place: n.place,
            tags: n.tags
        });
        try{
            await note.save();
        }catch(error){
            return res.status(500).send("Error while saving duplicate note");
        }
        res.send("OK");
    }catch(error){
        return res.status(500).send("Error while fetching note");
    }
});

//gestione richiesta post per il login/register di un utente
//la tipologia della registrazione viene passata nell'URL della richiesta
//alla fine della gestione della richiesta se non ci sono stati errori l'utente viene salvato nella variabile currentUser utilizzata per le operazioni e i display dei post
app.post("/user/:regType",async (req,res) => {
    var newUser = null;
    var user = null;
    var x = null;
    //oggetto utilizzato per una più facile ricerca nel database
    const loggedUser = {
        name: req.body.username,
        passw: req.body.password
    };

    if(req.params.regType == "Login"){
        try{
            user = await User.findOne(loggedUser);
            if(!user){
                res.json({
                    message: "user not found while login"
                });
            }else{
                currentUser = user;
                res.json({message: "OK"});
            }
        }catch(error){
            res.status(500).send("Error login");
        }
    }else{
        x = await User.findOne(loggedUser);
        //se viene effettuata una registrazione di un nuovo utente ma è già presente un utente con quel nome nel database la richiesta non viene effettuata
        if(x){
            res.json({
                message: "username found while register"
            });
        }else{
            var newUser = new User({
                name: req.body.username,
                passw: req.body.password
            });
            try{
                newUser.save();
                currentUser = newUser;
                res.json({message: "OK"});
            }catch(error){
                res.status(500).send("Error saving new user");
            }
        }
    }
});

app.get("/user/checkLogged",(req,res) => {
    res.json({message: currentUser != null ? "true" : "false"});
});

app.get("/user/logout",(req,res) => {
    currentUser = null;
    res.json({message: "OK"});
});

//---------------------------------------------------------------
//funzioni per la gestione della ricerca 
//!!!NOTA!!! --> NON TESTATE
async function realSearch(u,filter,query){
    let results = [];
    if(filter == "tag"){
        const allNote = await Note.find({user: u, public: true});
        //aggiungere todo
        allNote.forEach(item => {
            if(item.tags.includes(query)){
                results.push(item);
            }
        });
    }else{
        const resultsNote = await Note.find({
            user: u,
            public: true,
            [filter]: {$regex: new RegExp(query,'i')}
        });
        //aggiungere todo
        results = resultsNote;
    }
    return results;
}

async function asyncFunc(user,filter,query){
    const results = await realSearch(user,filter,query);
    return results;
}

async function processUsers(users,filter,query){
    const promises = users.map(user => asyncFunc(user,filter,query));
    const results = await Promise.all(promises);
    return results.flat();
}

app.post('/search',async (req,res) => {
    if(!req.query.query){
        res.status(400).send("Query parameter is required");
    }
    try{
        const query = req.query.query;
        const filter = req.query.filter;
        const friends = req.query.friends;

        var users;
        if(friends == "true"){
            users = currentUser.friends;
        }else{
            users = [currentUser.name];
        }

        const searchResults = await processUsers(users,filter,query);

        res.json(searchResults);
    }catch(error){
        console.log("Search error: ",error);
        res.status(500).send("Error while search");
    }
});
//-----------------------------------------------------------------------

app.listen(3000,() => {
    console.log("app listening on port 3000");
});