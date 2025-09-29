# Introduction

Welcome to the examples section! Here, you'll find a variety of code snippets and demonstrations to help you understand how to use our library effectively. Whether you're a beginner or an experienced developer, these examples will guide you through different functionalities and use cases.

The examples are either standalone projects or are written as Markdown files with TypeScript code blocks and act as doctests, ensuring that they are always up-to-date and functional. You can run them using Vitest to see how they work in practice.
Please note that when the dependencies required for a specific example are not installed, the example will be skipped to avoid errors. You can always install the missing dependencies and run the examples locally.

To run the examples, navigate to the `examples` directory, install the necessary dependencies, and execute the tests:

```bash
cd examples
npm install
vitest
```

If you are unfamiliar what doctest is - it's a testing approach where code examples in documentation are executed as tests to ensure they work as intended. This helps keep the documentation accurate and reliable. This approach is inspired by Python's [doctest](https://docs.python.org/3/library/doctest.html) module and relies on [doc-vitest](https://github.com/ssssota/doc-vitest).

Example list:
- [Basic Usage](basic-usage.md): A simple example demonstrating the core functionality of the library.
- [Integration with Other Libraries](integration.md): How to integrate this library with popular frameworks and tools.
- [i18n](i18n.md): An example of how to use the library with internationalization support.
- [JSON Schema validation](json-schema.md): Demonstrates how to validate data using JSON Schema.
- [yaml](yaml.md): Shows how to work with YAML files using the library.
- [ZOD validation](./zod-validate/index.md): An example of data validation using ZOD.
