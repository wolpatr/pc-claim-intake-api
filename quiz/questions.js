(function (global) {
  "use strict";

  var TOPICS = [
    {
      id: "project",
      name: "Project & P&C",
      blurb: "The claim-intake API, its rules, and basic insurance vocabulary."
    },
    {
      id: "fundamentals",
      name: "Software Fundamentals",
      blurb: "Core programming and problem-solving ideas."
    },
    {
      id: "java",
      name: "Java",
      blurb: "Types, classes, collections, exceptions, and the JVM."
    },
    {
      id: "ood",
      name: "Object-Oriented Design",
      blurb: "Encapsulation, interfaces, responsibilities, and coupling."
    },
    {
      id: "agile",
      name: "Agile",
      blurb: "Iterations, stories, feedback, and Scrum basics."
    },
    {
      id: "git",
      name: "Git",
      blurb: "Commits, branches, merges, and pull requests."
    },
    {
      id: "rest",
      name: "REST",
      blurb: "HTTP, resources, status codes, and JSON."
    },
    {
      id: "testing",
      name: "Testing & CI",
      blurb: "Unit tests, JUnit, quality, and delivery pipelines."
    }
  ];

  var TF = ["True", "False"];

  var QUESTIONS = [
    // ---------------------------------------------------------------- project
    {
      id: "project-01",
      topic: "project",
      type: "multiple-choice",
      prompt: "What does this repository build?",
      options: [
        "A production insurance claims platform",
        "A small P&C claim-intake REST API in Java",
        "A mobile claims app",
        "A database engine"
      ],
      answer: 1,
      explanation:
        "README.md describes a small P&C (property and casualty) claim-intake REST API in Java, explicitly a learning project rather than a production system."
    },
    {
      id: "project-02",
      topic: "project",
      type: "true-false",
      prompt:
        "Claims in this project are mock data held in memory, not real policyholder records.",
      options: TF,
      answer: 0,
      explanation:
        "The user stories state that records live in memory only, use mock data, involve no real policyholder data, and disappear when the application stops."
    },
    {
      id: "project-03",
      topic: "project",
      type: "multiple-choice",
      prompt: "A newly accepted claim starts in which status?",
      options: ["OPEN", "IN_REVIEW", "CLOSED", "PAID"],
      answer: 0,
      explanation:
        "The shared vocabulary in docs/user-stories.md says a new claim starts at OPEN; it then moves through IN_REVIEW to CLOSED."
    },
    {
      id: "project-04",
      topic: "project",
      type: "multiple-choice",
      prompt: "Which set lists the valid claim statuses in this project?",
      options: [
        "OPEN, IN_REVIEW, CLOSED",
        "NEW, OPEN, CLOSED",
        "OPEN, PENDING, PAID",
        "DRAFT, IN_REVIEW, DONE"
      ],
      answer: 0,
      explanation:
        "Only OPEN, IN_REVIEW, and CLOSED are valid statuses; any other value must be rejected with a validation error."
    },
    {
      id: "project-05",
      topic: "project",
      type: "multiple-choice",
      prompt:
        "According to the user stories, which fields are required for a claim to be accepted?",
      options: [
        "Claimant name, claimant email, policy number, date of loss, claim type, loss description, and amount",
        "Policy number and claim amount",
        "Claimant name and email address",
        "Incident date and insurance agent ID"
      ],
      answer: 0,
      explanation:
        "All seven fields are required: claimant name, claimant email, policy number, date of loss, claim type, loss description, and amount. Missing or blank values cause a validation error."
    },
    {
      id: "project-06",
      topic: "project",
      type: "true-false",
      prompt:
        "A required field that contains only whitespace is treated as missing.",
      options: TF,
      answer: 0,
      explanation:
        "The validation rules say an empty or whitespace-only required field counts as missing, so the claim is rejected."
    },
    {
      id: "project-07",
      topic: "project",
      type: "multiple-choice",
      prompt:
        "What should the service return when asked for a claim ID it never recorded?",
      options: [
        "An empty claim",
        "The closest matching claim",
        "A not-found error",
        "A new claim with that ID"
      ],
      answer: 2,
      explanation:
        "Retrieving an unknown claim ID must produce a not-found error, never an empty or partial claim."
    },
    {
      id: "project-08",
      topic: "project",
      type: "multiple-choice",
      prompt:
        "In the study plan, when are the basic REST claim endpoints planned to be built?",
      options: ["Day 1", "Day 2", "Day 3", "Day 7"],
      answer: 2,
      explanation:
        "Day 3 of the study plan is REST and insurance context: build basic claim endpoints and learn HTTP, JSON, and status codes."
    },
    {
      id: "project-09",
      topic: "project",
      type: "true-false",
      prompt:
        "Updating a claim's status should also change its claimant name and loss description.",
      options: TF,
      answer: 1,
      explanation:
        "A status update changes only the status; the claim's other details (claimant name, policy number, date of loss, loss description) stay unchanged."
    },
    {
      id: "project-10",
      topic: "project",
      type: "multiple-choice",
      prompt: "In insurance, what does P&C stand for?",
      options: [
        "Property & Casualty",
        "Personal & Commercial",
        "Policy & Claims",
        "Premium & Coverage"
      ],
      answer: 0,
      explanation:
        "P&C means property and casualty. The study plan notes that Guidewire's systems support the P&C insurance lifecycle."
    },
    {
      id: "project-11",
      topic: "project",
      type: "multiple-choice",
      prompt: "In insurance, who is the policyholder?",
      options: [
        "An employee of the insurer",
        "The person or organization that owns the policy",
        "The person who repairs the damaged property",
        "The government regulator"
      ],
      answer: 1,
      explanation:
        "The policyholder owns the insurance policy and pays its premium. The claimant files the claim and may be the policyholder or someone else."
    },
    {
      id: "project-12",
      topic: "project",
      type: "multiple-choice",
      prompt:
        "In a P&C insurer, which system typically handles premium invoices and payments?",
      options: [
        "The billing system",
        "The claims system",
        "The underwriting system",
        "The actuarial system"
      ],
      answer: 0,
      explanation:
        "Billing handles premiums, policy administration manages the policy, and claims handles reported losses. The study plan stresses this vocabulary."
    },
    {
      id: "project-13",
      topic: "project",
      type: "multiple-choice",
      prompt: "What is an insurance premium?",
      options: [
        "The amount paid for insurance coverage",
        "The amount paid out on a claim",
        "The unique policy number",
        "The claim's current status"
      ],
      answer: 0,
      explanation:
        "A premium is the money a policyholder pays the insurer for coverage. A claim payout is a different concept."
    },
    {
      id: "project-14",
      topic: "project",
      type: "multiple-choice",
      prompt:
        "Which of these belongs to a claim record in the claim-intake domain?",
      options: [
        "Policy number",
        "Claim type and amount",
        "Incident date and description",
        "All of the above"
      ],
      answer: 3,
      explanation:
        "A claim carries a policy number, claimant details, incident date, claim type, description, amount, and status. The required fields are claimant name, claimant email, policy number, date of loss, claim type, loss description, and amount."
    },
    {
      id: "project-15",
      topic: "project",
      type: "true-false",
      prompt:
        "The claim-intake service assigns each accepted claim a unique claim ID.",
      options: TF,
      answer: 0,
      explanation:
        "When a claim is accepted, the system records it and assigns a unique claim ID, then returns the recorded claim including that ID."
    },
    {
      id: "project-16",
      topic: "project",
      type: "multiple-choice",
      prompt: "Which stack does this learning project plan to use?",
      options: [
        "Java, REST/JSON, JUnit, and a GitHub Actions CI workflow",
        "Python, GraphQL, pytest, and Jenkins",
        "C# and a Windows desktop UI",
        "PHP and a MySQL-backed production service"
      ],
      answer: 0,
      explanation:
        "README.md lists Java, REST over HTTP with JSON, JUnit unit tests, and a CI workflow using GitHub Actions."
    },

    // ----------------------------------------------------------- fundamentals
    {
      id: "fundamentals-01",
      topic: "fundamentals",
      type: "multiple-choice",
      prompt: "An algorithm is best described as:",
      options: [
        "A finite sequence of unambiguous steps that solves a problem",
        "A programming language",
        "A database table",
        "A design pattern"
      ],
      answer: 0,
      explanation:
        "An algorithm is a finite, well-defined procedure. A programming language is one way to express it."
    },
    {
      id: "fundamentals-02",
      topic: "fundamentals",
      type: "true-false",
      prompt:
        "A variable is a named reference to a value that can change while a program runs.",
      options: TF,
      answer: 0,
      explanation:
        "That is what distinguishes a variable from a constant: the value it refers to can be reassigned."
    },
    {
      id: "fundamentals-03",
      topic: "fundamentals",
      type: "multiple-choice",
      prompt: "What is a constant?",
      options: [
        "A value that cannot be reassigned after it is set",
        "A value that changes on every loop iteration",
        "A function that returns nothing",
        "A type of database index"
      ],
      answer: 0,
      explanation:
        "A constant is fixed once assigned, which makes code easier to reason about and prevents accidental changes."
    },
    {
      id: "fundamentals-04",
      topic: "fundamentals",
      type: "multiple-choice",
      prompt: "What is a function parameter?",
      options: [
        "An input the caller passes in",
        "The value the function returns",
        "The function's name",
        "The file the function lives in"
      ],
      answer: 0,
      explanation:
        "Parameters name the inputs a function accepts; arguments are the actual values supplied at the call site."
    },
    {
      id: "fundamentals-05",
      topic: "fundamentals",
      type: "multiple-choice",
      prompt: "What is a return value?",
      options: [
        "The result a function hands back to its caller",
        "The number of lines in the function",
        "The input the function accepted",
        "The error message on failure"
      ],
      answer: 0,
      explanation:
        "A return value lets a function communicate a result to the code that called it."
    },
    {
      id: "fundamentals-06",
      topic: "fundamentals",
      type: "multiple-choice",
      prompt:
        "Which control structure repeats a block while a condition remains true?",
      options: ["A while loop", "An if statement", "A switch statement", "A try block"],
      answer: 0,
      explanation:
        "Loops repeat work. An if or switch selects a branch, and a try block handles errors."
    },
    {
      id: "fundamentals-07",
      topic: "fundamentals",
      type: "true-false",
      prompt:
        "Broadly, a compiler translates source code into another form before execution, while an interpreter executes instructions more directly.",
      options: TF,
      answer: 0,
      explanation:
        "Java compiles once to bytecode and the JVM executes it; languages described as interpreted run source or intermediate code more directly."
    },
    {
      id: "fundamentals-08",
      topic: "fundamentals",
      type: "multiple-choice",
      prompt: "What is a good first step when debugging a failing program?",
      options: [
        "Reproduce the failure reliably",
        "Rewrite the whole program from scratch",
        "Ignore the failure and ship it",
        "Add print statements at random"
      ],
      answer: 0,
      explanation:
        "A reliable reproduction lets you narrow down the cause, fix it, and then verify the fix. Random changes make debugging harder."
    },
    {
      id: "fundamentals-09",
      topic: "fundamentals",
      type: "multiple-choice",
      prompt: "What does DRY stand for?",
      options: [
        "Don't Repeat Yourself",
        "Debug, Run, Yield",
        "Data, Record, Year",
        "Deploy, Review, Yourself"
      ],
      answer: 0,
      explanation:
        "DRY encourages one authoritative place for each piece of knowledge, so fixes do not have to be repeated everywhere."
    },
    {
      id: "fundamentals-10",
      topic: "fundamentals",
      type: "true-false",
      prompt:
        "An API is a contract that lets one piece of software call another without knowing its internal implementation.",
      options: TF,
      answer: 0,
      explanation:
        "An API defines what callers can ask for and what they get back, hiding how the work is done."
    },
    {
      id: "fundamentals-11",
      topic: "fundamentals",
      type: "multiple-choice",
      prompt: "Which running time grows more slowly as the input size increases?",
      options: ["O(n)", "O(n squared)", "O(2 to the n)", "O(n factorial)"],
      answer: 0,
      explanation:
        "O(n) grows linearly, while O(n squared), O(2^n), and O(n!) grow much faster and quickly become impractical."
    },
    {
      id: "fundamentals-12",
      topic: "fundamentals",
      type: "true-false",
      prompt:
        "Separation of concerns means keeping different responsibilities in different code units.",
      options: TF,
      answer: 0,
      explanation:
        "Splitting responsibilities makes each piece easier to understand, test, and change without breaking the others."
    },

    // ------------------------------------------------------------------- java
    {
      id: "java-01",
      topic: "java",
      type: "multiple-choice",
      prompt: "What executes Java bytecode?",
      options: [
        "The Java Virtual Machine (JVM)",
        "The web browser",
        "The operating system kernel",
        "JUnit"
      ],
      answer: 0,
      explanation:
        "The Java compiler produces bytecode, and the JVM executes it, which is what makes Java portable across platforms."
    },
    {
      id: "java-02",
      topic: "java",
      type: "true-false",
      prompt:
        "public static void main(String[] args) is the usual entry point of a Java program.",
      options: TF,
      answer: 0,
      explanation:
        "The JVM looks for that exact signature to start a standalone Java application."
    },
    {
      id: "java-03",
      topic: "java",
      type: "multiple-choice",
      prompt: "Which of these is a primitive type in Java?",
      options: ["int", "String", "ArrayList", "Integer"],
      answer: 0,
      explanation:
        "int is a primitive. String, ArrayList, and Integer are reference types (classes)."
    },
    {
      id: "java-04",
      topic: "java",
      type: "multiple-choice",
      prompt:
        "When applied to two object references, what does == compare?",
      options: [
        "Whether they refer to the same object",
        "Whether their contents are logically equal",
        "Their field count",
        "Their runtime type"
      ],
      answer: 0,
      explanation:
        "== on references checks identity (same object). Use equals for logical equality, such as comparing String contents."
    },
    {
      id: "java-05",
      topic: "java",
      type: "true-false",
      prompt: "Strings in Java are immutable.",
      options: TF,
      answer: 0,
      explanation:
        "A String's value cannot change; methods such as trim or toUpperCase return a new String."
    },
    {
      id: "java-06",
      topic: "java",
      type: "multiple-choice",
      prompt: "Which collection maps keys to values?",
      options: ["HashMap", "ArrayList", "HashSet", "LinkedList"],
      answer: 0,
      explanation:
        "A Map stores key-value pairs. ArrayList and LinkedList are lists, and HashSet is a set of unique elements."
    },
    {
      id: "java-07",
      topic: "java",
      type: "multiple-choice",
      prompt: "Which keyword prevents a variable from being reassigned?",
      options: ["final", "static", "private", "void"],
      answer: 0,
      explanation:
        "final makes a variable's binding fixed. For an object reference, the reference is fixed but the object may still be mutable."
    },
    {
      id: "java-08",
      topic: "java",
      type: "multiple-choice",
      prompt:
        "Which access modifier makes a member visible only inside its own class?",
      options: ["private", "public", "protected", "default (package-private)"],
      answer: 0,
      explanation:
        "private restricts access to the declaring class. package-private (no modifier) allows access within the same package."
    },
    {
      id: "java-09",
      topic: "java",
      type: "multiple-choice",
      prompt: "What does the static modifier mean on a member?",
      options: [
        "It belongs to the class rather than to an instance",
        "It is immutable",
        "It is private",
        "It runs on a separate thread"
      ],
      answer: 0,
      explanation:
        "A static field or method is shared at the class level and can be used without creating an object."
    },
    {
      id: "java-10",
      topic: "java",
      type: "multiple-choice",
      prompt: "Checked exceptions must be:",
      options: [
        "Caught or declared in the method signature",
        "Ignored",
        "Logged to a file",
        "Converted into runtime exceptions"
      ],
      answer: 0,
      explanation:
        "The compiler enforces handling of checked exceptions through a catch block or a throws clause."
    },
    {
      id: "java-11",
      topic: "java",
      type: "true-false",
      prompt: "A Java class can directly extend more than one class.",
      options: TF,
      answer: 1,
      explanation:
        "Java supports single class inheritance. A class can implement multiple interfaces, but extend only one class."
    },
    {
      id: "java-12",
      topic: "java",
      type: "multiple-choice",
      prompt: "What does an interface primarily define?",
      options: [
        "A contract of method signatures that implementers must provide",
        "A memory layout",
        "A database schema",
        "A thread pool"
      ],
      answer: 0,
      explanation:
        "An interface declares behavior without committing to an implementation, so callers can depend on the contract."
    },
    {
      id: "java-13",
      topic: "java",
      type: "multiple-choice",
      prompt: "What do generics such as List<String> provide?",
      options: [
        "Compile-time type checking",
        "A new JVM per collection",
        "Documentation comments only",
        "Guaranteed faster runtime performance"
      ],
      answer: 0,
      explanation:
        "Generics let the compiler check element types, catching many mistakes before the program runs."
    },
    {
      id: "java-14",
      topic: "java",
      type: "true-false",
      prompt: "Integer is an object wrapper around the primitive int.",
      options: TF,
      answer: 0,
      explanation:
        "Wrapper classes such as Integer and Double let primitives be used where objects are required, including in collections."
    },
    {
      id: "java-15",
      topic: "java",
      type: "multiple-choice",
      prompt:
        "In a try/catch/finally statement, which block runs even when an exception is thrown?",
      options: ["The finally block", "The try block only", "The catch block only", "None of them"],
      answer: 0,
      explanation:
        "The finally block runs after try and catch (barring a JVM exit), which makes it suitable for cleanup."
    },

    // -------------------------------------------------------------------- ood
    {
      id: "ood-01",
      topic: "ood",
      type: "multiple-choice",
      prompt: "What does encapsulation mean?",
      options: [
        "Bundling data with the behavior that uses it and restricting direct access",
        "Copying code between classes",
        "Using global variables",
        "Extending several classes at once"
      ],
      answer: 0,
      explanation:
        "Encapsulation keeps an object's state private and exposes controlled operations, protecting its invariants."
    },
    {
      id: "ood-02",
      topic: "ood",
      type: "multiple-choice",
      prompt: "Which is an example of polymorphism?",
      options: [
        "A subtype overrides a method and is called through the supertype",
        "A for loop",
        "A code comment",
        "A package import"
      ],
      answer: 0,
      explanation:
        "Polymorphism lets one call site work with different concrete types that share a contract."
    },
    {
      id: "ood-03",
      topic: "ood",
      type: "true-false",
      prompt:
        "Inheritance lets a class reuse and specialize another class's behavior.",
      options: TF,
      answer: 0,
      explanation:
        "A subclass inherits accessible members and can override or extend behavior, expressing an is-a relationship."
    },
    {
      id: "ood-04",
      topic: "ood",
      type: "multiple-choice",
      prompt: "What does abstraction focus on?",
      options: [
        "Essential behavior while hiding implementation detail",
        "Hiding all code from every developer",
        "Making every field public",
        "Avoiding interfaces"
      ],
      answer: 0,
      explanation:
        "Abstraction exposes what a component does and hides how, so callers stay insulated from internal changes."
    },
    {
      id: "ood-05",
      topic: "ood",
      type: "multiple-choice",
      prompt: "Why is low coupling between classes desirable?",
      options: [
        "A change in one class is less likely to break others",
        "It makes the code longer",
        "It removes the need for tests",
        "It prevents inheritance"
      ],
      answer: 0,
      explanation:
        "Fewer dependencies make components easier to change, test, and replace independently."
    },
    {
      id: "ood-06",
      topic: "ood",
      type: "multiple-choice",
      prompt: "What does high cohesion mean?",
      options: [
        "A class's members work together on one focused responsibility",
        "Classes depend on many other classes",
        "Methods are very long",
        "All fields are public"
      ],
      answer: 0,
      explanation:
        "High cohesion keeps a unit focused on one job, which improves readability and reduces ripple effects."
    },
    {
      id: "ood-07",
      topic: "ood",
      type: "true-false",
      prompt:
        "Composition (has-a) is often preferred over deep inheritance (is-a) for flexibility.",
      options: TF,
      answer: 0,
      explanation:
        "Composition lets you assemble behavior at runtime and avoids fragile, tightly coupled class hierarchies."
    },
    {
      id: "ood-08",
      topic: "ood",
      type: "multiple-choice",
      prompt:
        "The Single Responsibility Principle says a class should have:",
      options: [
        "One reason to change",
        "Exactly one method",
        "Exactly one field",
        "Exactly one constructor"
      ],
      answer: 0,
      explanation:
        "It is about one cohesive responsibility, not a literal count of methods or fields."
    },
    {
      id: "ood-09",
      topic: "ood",
      type: "multiple-choice",
      prompt:
        "Keeping a claim's data and its status together in one domain object is an example of:",
      options: [
        "Encapsulation and domain modeling",
        "A build script",
        "An HTTP header",
        "A CI job"
      ],
      answer: 0,
      explanation:
        "A domain object groups related state and behavior, hiding the details behind meaningful operations."
    },
    {
      id: "ood-10",
      topic: "ood",
      type: "multiple-choice",
      prompt: "Why is an interface useful in a design?",
      options: [
        "Callers can depend on behavior rather than a concrete implementation",
        "It stores persistent data",
        "It compiles the program",
        "It replaces the need for tests"
      ],
      answer: 0,
      explanation:
        "Depending on an interface makes code easier to test with stand-ins and easier to extend with new implementations."
    },
    {
      id: "ood-11",
      topic: "ood",
      type: "true-false",
      prompt:
        "Polymorphism lets the same method call behave differently depending on the actual object type.",
      options: TF,
      answer: 0,
      explanation:
        "Overriding plus dynamic dispatch means the runtime type selects the implementation that runs."
    },

    // ------------------------------------------------------------------ agile
    {
      id: "agile-01",
      topic: "agile",
      type: "multiple-choice",
      prompt: "Which of these is a value from the Agile Manifesto?",
      options: [
        "Working software over comprehensive documentation",
        "Contracts over collaboration",
        "Plans over responding to change",
        "Tools over individuals"
      ],
      answer: 0,
      explanation:
        "The manifesto values working software, individuals and interactions, customer collaboration, and responding to change."
    },
    {
      id: "agile-02",
      topic: "agile",
      type: "multiple-choice",
      prompt: "What is a sprint (iteration)?",
      options: [
        "A short, fixed timebox that produces a usable increment",
        "A two-year master plan",
        "A deployment tool",
        "A code review checklist"
      ],
      answer: 0,
      explanation:
        "Short iterations create regular opportunities to inspect progress and adapt, based on working software."
    },
    {
      id: "agile-03",
      topic: "agile",
      type: "multiple-choice",
      prompt: "Which is the usual user story format?",
      options: [
        "As a role, I want a goal, so that a benefit",
        "Given a bug, when a fix, then a release",
        "Step 1, step 2, step 3",
        "If a condition, then a result"
      ],
      answer: 0,
      explanation:
        "The role-goal-benefit form keeps the focus on who needs the change and why it matters."
    },
    {
      id: "agile-04",
      topic: "agile",
      type: "multiple-choice",
      prompt: "What do acceptance criteria describe?",
      options: [
        "Conditions a story must satisfy to be accepted",
        "The sprint budget",
        "The team roster",
        "The database schema"
      ],
      answer: 0,
      explanation:
        "Acceptance criteria make a story testable by stating the observable behavior that counts as done."
    },
    {
      id: "agile-05",
      topic: "agile",
      type: "true-false",
      prompt:
        "The product backlog is an ordered list of work the product may need.",
      options: TF,
      answer: 0,
      explanation:
        "The product owner orders the backlog to reflect value and priority, and the team refines it over time."
    },
    {
      id: "agile-06",
      topic: "agile",
      type: "multiple-choice",
      prompt: "What is the main purpose of a daily stand-up?",
      options: [
        "Synchronize work and surface impediments",
        "Write code together for an hour",
        "Estimate salaries",
        "Approve pull requests"
      ],
      answer: 0,
      explanation:
        "The stand-up is a short coordination event, not a status report to a manager or a deep technical session."
    },
    {
      id: "agile-07",
      topic: "agile",
      type: "multiple-choice",
      prompt: "What is a retrospective?",
      options: [
        "A team reflection on how to improve",
        "A demo to customers",
        "A plan for next quarter",
        "A code freeze"
      ],
      answer: 0,
      explanation:
        "The retrospective looks back at how the team worked and chooses improvements for the next iteration."
    },
    {
      id: "agile-08",
      topic: "agile",
      type: "true-false",
      prompt:
        "Agile favors delivering working software frequently and responding to change.",
      options: TF,
      answer: 0,
      explanation:
        "Frequent delivery and responsiveness to change are two of the manifesto's core values and principles."
    },
    {
      id: "agile-09",
      topic: "agile",
      type: "multiple-choice",
      prompt: "In Scrum, who usually owns and orders the product backlog?",
      options: [
        "The Product Owner",
        "The Scrum Master",
        "The CI server",
        "A customer's lawyer"
      ],
      answer: 0,
      explanation:
        "The Product Owner maximizes value by ordering the backlog. The Scrum Master facilitates the process instead."
    },
    {
      id: "agile-10",
      topic: "agile",
      type: "multiple-choice",
      prompt: "What is a Definition of Done?",
      options: [
        "A shared checklist of what complete means for work",
        "A legal contract with the customer",
        "A test framework",
        "A deployment script"
      ],
      answer: 0,
      explanation:
        "The Definition of Done gives the team a consistent quality bar, so finished work is genuinely usable."
    },
    {
      id: "agile-11",
      topic: "agile",
      type: "true-false",
      prompt:
        "In Agile, a late change in requirements is always forbidden.",
      options: TF,
      answer: 1,
      explanation:
        "Agile welcomes changing requirements; the team manages them with the product owner and adjusts plans rather than banning change."
    },

    // -------------------------------------------------------------------- git
    {
      id: "git-01",
      topic: "git",
      type: "multiple-choice",
      prompt: "What does a Git commit represent?",
      options: [
        "A snapshot of staged changes with a message",
        "A remote server",
        "A deleted branch",
        "A merge conflict"
      ],
      answer: 0,
      explanation:
        "A commit records the staged snapshot in history together with its metadata and message."
    },
    {
      id: "git-02",
      topic: "git",
      type: "multiple-choice",
      prompt: "What is a Git branch?",
      options: [
        "A named pointer to a commit that moves as you commit",
        "A full copy of the repository on disk",
        "A backup archive",
        "A tag that never moves"
      ],
      answer: 0,
      explanation:
        "Branches are cheap pointers into history. A tag, by contrast, is meant to stay fixed."
    },
    {
      id: "git-03",
      topic: "git",
      type: "true-false",
      prompt:
        "git clone copies a remote repository, including its history, to your machine.",
      options: TF,
      answer: 0,
      explanation:
        "Cloning creates a local repository with the remote's commits and a remote named origin by default."
    },
    {
      id: "git-04",
      topic: "git",
      type: "multiple-choice",
      prompt: "Which command stages a file for the next commit?",
      options: ["git add", "git commit", "git push", "git status"],
      answer: 0,
      explanation:
        "git add moves changes into the staging area; git commit then records the staged snapshot."
    },
    {
      id: "git-05",
      topic: "git",
      type: "multiple-choice",
      prompt: "What is a pull request?",
      options: [
        "A request to review and merge changes from one branch into another",
        "A command that downloads code",
        "A type of Git commit",
        "A merge conflict"
      ],
      answer: 0,
      explanation:
        "A pull request proposes changes, shows the diff, and supports review and discussion before merging."
    },
    {
      id: "git-06",
      topic: "git",
      type: "multiple-choice",
      prompt: "What does git status show?",
      options: [
        "The working tree and staging state",
        "The full diff of every commit",
        "The list of remote users",
        "The branch's CI results"
      ],
      answer: 0,
      explanation:
        "git status reports the current branch and which files are modified, staged, or untracked."
    },
    {
      id: "git-07",
      topic: "git",
      type: "true-false",
      prompt:
        "A merge conflict happens when Git cannot automatically reconcile changes from different branches.",
      options: TF,
      answer: 0,
      explanation:
        "Git marks the conflicting regions and asks you to resolve them, then you stage the result and commit."
    },
    {
      id: "git-08",
      topic: "git",
      type: "multiple-choice",
      prompt:
        "Which command downloads new commits from a remote without merging them into the current branch?",
      options: ["git fetch", "git pull", "git push", "git commit"],
      answer: 0,
      explanation:
        "git fetch updates remote-tracking branches; git pull fetches and then merges or rebases."
    },
    {
      id: "git-09",
      topic: "git",
      type: "multiple-choice",
      prompt: "What does git log show?",
      options: [
        "The commit history",
        "Untracked files",
        "Only remote branches",
        "File permissions"
      ],
      answer: 0,
      explanation:
        "git log lists commits, usually newest first, with authors, dates, and messages."
    },
    {
      id: "git-10",
      topic: "git",
      type: "multiple-choice",
      prompt: "What is .gitignore for?",
      options: [
        "Listing files Git should not track",
        "Encrypting files",
        "Deleting files from disk",
        "Renaming branches"
      ],
      answer: 0,
      explanation:
        "Ignored patterns keep build output, IDE files, and secrets out of commits."
    },
    {
      id: "git-11",
      topic: "git",
      type: "true-false",
      prompt:
        "git revert creates a new commit that undoes an earlier commit's changes, preserving history.",
      options: TF,
      answer: 0,
      explanation:
        "Revert is the safe, shared-history-friendly way to undo a commit; reset rewrites history instead."
    },
    {
      id: "git-12",
      topic: "git",
      type: "multiple-choice",
      prompt: "What does a feature-branch workflow mean?",
      options: [
        "Develop changes on a separate branch before merging them",
        "Never commit any changes",
        "Edit the default branch directly",
        "Work only with tags"
      ],
      answer: 0,
      explanation:
        "A feature branch isolates work, enabling review and CI before it lands on the main branch."
    },

    // ------------------------------------------------------------------- rest
    {
      id: "rest-01",
      topic: "rest",
      type: "multiple-choice",
      prompt: "What is REST?",
      options: [
        "An architectural style for APIs built around resources and HTTP",
        "A Java framework",
        "A database",
        "A testing tool"
      ],
      answer: 0,
      explanation:
        "REST organizes an API around resources addressed by URIs and manipulated with standard HTTP methods."
    },
    {
      id: "rest-02",
      topic: "rest",
      type: "multiple-choice",
      prompt: "Which HTTP method is typically used to create a new claim?",
      options: ["POST", "GET", "DELETE", "HEAD"],
      answer: 0,
      explanation:
        "POST sends data to a collection endpoint to create a new resource; the server answers with 201 Created."
    },
    {
      id: "rest-03",
      topic: "rest",
      type: "multiple-choice",
      prompt: "Which method retrieves a claim without changing it?",
      options: ["GET", "POST", "PUT", "PATCH"],
      answer: 0,
      explanation:
        "GET is safe and read-only; the other methods are meant to modify server state."
    },
    {
      id: "rest-04",
      topic: "rest",
      type: "multiple-choice",
      prompt:
        "Which method is conventionally used to replace a resource's representation?",
      options: ["PUT", "GET", "POST", "OPTIONS"],
      answer: 0,
      explanation:
        "PUT sends a full replacement representation; PATCH is for partial updates."
    },
    {
      id: "rest-05",
      topic: "rest",
      type: "multiple-choice",
      prompt:
        "Which status code means the request was invalid, for example because required fields are missing?",
      options: ["400", "200", "404", "500"],
      answer: 0,
      explanation:
        "400 Bad Request covers client-side validation failures; 404 is a missing resource and 500 is a server error."
    },
    {
      id: "rest-06",
      topic: "rest",
      type: "multiple-choice",
      prompt: "Which status code means the requested claim ID was not found?",
      options: ["404", "201", "400", "204"],
      answer: 0,
      explanation:
        "404 Not Found tells the client the addressed resource does not exist."
    },
    {
      id: "rest-07",
      topic: "rest",
      type: "multiple-choice",
      prompt: "Which status code signals that a resource was successfully created?",
      options: ["201", "200", "204", "301"],
      answer: 0,
      explanation:
        "201 Created is the conventional response to a successful POST that creates a resource."
    },
    {
      id: "rest-08",
      topic: "rest",
      type: "multiple-choice",
      prompt: "What does a 500 status code usually mean?",
      options: [
        "The server hit an unexpected error",
        "The client sent a bad request",
        "The resource moved permanently",
        "The request succeeded"
      ],
      answer: 0,
      explanation:
        "5xx codes report server-side failures; 500 is the generic unexpected-error response."
    },
    {
      id: "rest-09",
      topic: "rest",
      type: "true-false",
      prompt:
        "GET is expected to be safe and idempotent, so calling it repeatedly should not change server state.",
      options: TF,
      answer: 0,
      explanation:
        "Safe means no intended state change; idempotent means repeated identical requests leave the same result."
    },
    {
      id: "rest-10",
      topic: "rest",
      type: "true-false",
      prompt:
        "Statelessness in REST means each request carries the information the server needs, without relying on a stored conversation.",
      options: TF,
      answer: 0,
      explanation:
        "Stateless requests are easier to scale and retry, because the server does not keep per-client session state."
    },
    {
      id: "rest-11",
      topic: "rest",
      type: "multiple-choice",
      prompt:
        "Which is a good REST-style path for the claim with ID 42?",
      options: [
        "/claims/42",
        "/getClaim?id=42",
        "/claims/42/delete",
        "/claim42"
      ],
      answer: 0,
      explanation:
        "REST paths name resources with nouns and use the method for the action, rather than verbs in the URL."
    },
    {
      id: "rest-12",
      topic: "rest",
      type: "multiple-choice",
      prompt: "What is JSON?",
      options: [
        "A text data format built from objects and arrays",
        "A Java compiler",
        "An HTTP method",
        "A database engine"
      ],
      answer: 0,
      explanation:
        "JSON is a widely used, human-readable format for structured data exchanged between clients and servers."
    },
    {
      id: "rest-13",
      topic: "rest",
      type: "true-false",
      prompt: "REST APIs commonly exchange JSON over HTTP.",
      options: TF,
      answer: 0,
      explanation:
        "JSON over HTTP is the common default for REST-style services because it is simple, readable, and broadly supported."
    },
    {
      id: "rest-14",
      topic: "rest",
      type: "multiple-choice",
      prompt:
        "Which endpoint shape best fits updating only a claim's status?",
      options: [
        "PATCH /claims/42/status",
        "GET /claims/42/status",
        "POST /claims",
        "DELETE /claims/42"
      ],
      answer: 0,
      explanation:
        "A partial update to one part of a resource is a natural fit for PATCH; PUT is also used when sending the full status representation."
    },

    // ---------------------------------------------------------------- testing
    {
      id: "testing-01",
      topic: "testing",
      type: "multiple-choice",
      prompt: "What should a unit test check?",
      options: [
        "One small unit of behavior in isolation",
        "The entire system end to end",
        "The team's code review process",
        "Real production data"
      ],
      answer: 0,
      explanation:
        "Unit tests target a single behavior and run fast, so failures point to a small area of code."
    },
    {
      id: "testing-02",
      topic: "testing",
      type: "multiple-choice",
      prompt: "What is JUnit?",
      options: [
        "A Java testing framework",
        "A build tool",
        "A database",
        "A REST client"
      ],
      answer: 0,
      explanation:
        "JUnit provides annotations, assertions, and a runner for writing and executing Java tests."
    },
    {
      id: "testing-03",
      topic: "testing",
      type: "multiple-choice",
      prompt: "What does Arrange-Act-Assert describe?",
      options: [
        "The structure of a test: set up, exercise, verify",
        "Three CI stages",
        "Three Git commands",
        "Three design patterns"
      ],
      answer: 0,
      explanation:
        "The pattern makes a test easy to read: prepare inputs, perform the action, then assert the expected outcome."
    },
    {
      id: "testing-04",
      topic: "testing",
      type: "true-false",
      prompt:
        "An assertion states the expected result, and a failing assertion fails the test.",
      options: TF,
      answer: 0,
      explanation:
        "Assertions are the checks that decide whether the behavior under test matches expectations."
    },
    {
      id: "testing-05",
      topic: "testing",
      type: "multiple-choice",
      prompt: "Which is a good test for claim validation?",
      options: [
        "Submit a claim missing a required field and expect a validation error",
        "Only check that the application starts",
        "Write a test with no assertions",
        "Make the test depend on the previous test"
      ],
      answer: 0,
      explanation:
        "The test should exercise the specific rule and assert the observable error; independent tests are easier to diagnose."
    },
    {
      id: "testing-06",
      topic: "testing",
      type: "true-false",
      prompt: "A passing test suite proves the program has no bugs.",
      options: TF,
      answer: 1,
      explanation:
        "Tests show that the cases you wrote behave as expected. They cannot prove the absence of unknown bugs."
    },
    {
      id: "testing-07",
      topic: "testing",
      type: "multiple-choice",
      prompt: "What is an edge case?",
      options: [
        "A boundary or unusual input that may break assumptions",
        "The main success path only",
        "A code comment",
        "A build artifact"
      ],
      answer: 0,
      explanation:
        "Edge cases such as empty strings, nulls, or maximum values expose assumptions that ordinary inputs hide."
    },
    {
      id: "testing-08",
      topic: "testing",
      type: "multiple-choice",
      prompt: "What does continuous integration (CI) mean?",
      options: [
        "Automatically building and testing changes frequently",
        "Manually testing only before release",
        "Deploying every commit to production",
        "Writing documentation after each release"
      ],
      answer: 0,
      explanation:
        "CI merges work into a shared branch often and runs automated builds and tests to catch problems early."
    },
    {
      id: "testing-09",
      topic: "testing",
      type: "multiple-choice",
      prompt:
        "If CI tests fail on a pull request, what is the usual policy?",
      options: [
        "Block the merge until the problem is fixed",
        "Merge anyway",
        "Delete the branch",
        "Ignore the tests"
      ],
      answer: 0,
      explanation:
        "A failing required check protects the main branch from broken changes and is a common branch-protection rule."
    },
    {
      id: "testing-10",
      topic: "testing",
      type: "multiple-choice",
      prompt: "How does continuous delivery differ from continuous deployment?",
      options: [
        "Delivery keeps every change releasable but deploys on a decision; deployment releases automatically",
        "They are identical",
        "Delivery only runs tests",
        "Deployment skips tests"
      ],
      answer: 0,
      explanation:
        "Both automate the pipeline; delivery stops short of automatic production release, while deployment goes all the way."
    },
    {
      id: "testing-11",
      topic: "testing",
      type: "true-false",
      prompt:
        "Regression tests help catch when a new change breaks behavior that used to work.",
      options: TF,
      answer: 0,
      explanation:
        "Regression tests lock in known-good behavior so later changes that break it fail loudly."
    },
    {
      id: "testing-12",
      topic: "testing",
      type: "multiple-choice",
      prompt: "A good unit test should be:",
      options: [
        "Deterministic and independent of other tests",
        "Dependent on test execution order",
        "Dependent on the current clock",
        "Flaky"
      ],
      answer: 0,
      explanation:
        "Deterministic, isolated tests give trustworthy results and can be run in any order or in parallel."
    },
    {
      id: "testing-13",
      topic: "testing",
      type: "true-false",
      prompt:
        "GitHub Actions can run a build-and-test workflow automatically on pushes and pull requests.",
      options: TF,
      answer: 0,
      explanation:
        "A workflow file in .github/workflows defines triggers such as push and pull_request and the jobs to run."
    },
    {
      id: "testing-14",
      topic: "testing",
      type: "multiple-choice",
      prompt: "What does 100% line coverage guarantee?",
      options: [
        "Every line ran, but not that every behavior is correct",
        "The software is bug-free",
        "The design is perfect",
        "The code is fast"
      ],
      answer: 0,
      explanation:
        "Coverage measures which lines executed, not whether assertions were meaningful or all cases were considered."
    }
  ];

  global.QuizData = { topics: TOPICS, questions: QUESTIONS };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.QuizData;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
