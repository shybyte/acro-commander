import {Widgets} from 'blessed';
import FileManagerElement = Widgets.FileManagerElement;
import ListElement = Widgets.ListElement;

interface ImprovedListElement extends ListElement {
  selected: number;
}

interface ImprovedFileManagerElement extends FileManagerElement {
  value: string;
}
