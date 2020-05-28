import { In, getRepository } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';

import Category from '../models/Category';
import Transaction from '../models/Transaction';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const contactsReadStream = fs.createReadStream(filePath);

    const parsers = csvParse({
      from_line: 2,
    });

    const parseCSV = contactsReadStream.pipe(parsers);

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );
      if (!title || !type || !value) return;
      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    // get all categories registred database
    const categoryRepository = getRepository(Category);
    const CategoriesCadastred = await categoryRepository.find({
      where: {
        title: In(categories),
      },
    });

    // find categories existents by title into registry database
    const existentsCategoriesListName = CategoriesCadastred.map(
      (category: Category) => category.title,
    );

    // array with titles categories new for save database
    const addCategoryTitles = categories
      .filter(category => !existentsCategoriesListName.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoryRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );

    await categoryRepository.save(newCategories);

    const finalCategories = [...newCategories, ...CategoriesCadastred];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allNewsTransactions: any[] = [];

    function getCategories(transaction: CSVTransaction): string {
      const category_id = finalCategories.find(
        element => transaction.category === element.title,
      );
      if (category_id?.id) {
        return category_id.id;
      }
      return '';
    }

    transactions.map(transaction =>
      allNewsTransactions.push({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: getCategories(transaction),
      }),
    );

    const repoTransaction = getRepository(Transaction);
    const newTransaction = repoTransaction.create(allNewsTransactions);

    await repoTransaction.save(newTransaction);

    await fs.promises.unlink(filePath);

    return newTransaction;
  }
}

export default ImportTransactionsService;
