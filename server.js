import exrpess from "express";
import {body, validationResult} from "express-validator";
const app=express();

app.set("view engine","ejs");
app.use(express.urlencoded({extended: true}));

app.get("/", (req,res)=>{
    res.render("login")
});

app.listen(3000,()=>{
    console.log("Server is running on port 3000");
});
