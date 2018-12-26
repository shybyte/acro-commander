import {Widgets} from 'blessed';
import React, {Component} from 'react';
import {ImprovedListElement} from '../typings/blessed-improved';
import BoxOptions = Widgets.BoxOptions;
import Events = Widgets.Events;
import Screen = Widgets.Screen;


interface FastListProps<T> extends BoxOptions {
  items: ReadonlyArray<T>;
  label: string;
  screen: Screen;
  onEnter: () => void;
  renderItem: (item: T) => string;
}

interface FastListState {
  offset: number;
}

export class FastList<T> extends Component<FastListProps<T>, FastListState> {
  state: FastListState = {
    offset: 0,
  };

  listRef = React.createRef<ImprovedListElement>();

  constructor(props: FastListProps<T>) {
    super(props);
  }

  get listElement() {
    return this.listRef.current!;
  }

  get selectedIndex() {
    return this.listElement.selected + this.state.offset;
  }

  componentDidMount(): void {
    const listElement = this.listElement!;

    listElement.on('resize', () => {
      this.forceUpdate();
    });

    listElement.on('keypress', (_ch, key: Events.IKeyEventArg) => {
      const height = this.getInnerListHeight();
      const selectedIndex = listElement.selected;
      const offset = this.state.offset;
      if (key.name === 'enter') {
        this.props.onEnter();
      } else if (key.name === 'down') {
        if (selectedIndex === height - 1 && offset < this.props.items.length - this.getInnerListHeight()) {
          const newOffset = offset + 1;
          delete listElement.selected;
          this.setState({offset: newOffset});
          setTimeout(() => {
            listElement.select(this.getInnerListHeight() - 1);
          }, 0);
        } else {
          listElement.down(1);
        }
      } else if (key.name === 'up') {
        if (selectedIndex === 0 && offset > 0) {
          const newOffset = offset - 1;
          delete listElement.selected;
          this.setState({offset: newOffset});
          setTimeout(() => {
            listElement.select(0);
          }, 0);
        } else {
          listElement.up(1);
        }
      }
    });

  }

  get focusElement() {
    return this.listElement;
  }

  focus() {
    this.focusElement.focus();
  }

  getInnerListHeight() {
    return (this.listElement ? this.listElement.height : this.props.screen.height) as number - 2;
  }

  render() {
    const subList = this.props.items.slice(this.state.offset, this.state.offset + this.getInnerListHeight() + 1);
    return (
      <blessed-list
        {...this.props}
        ref={this.listRef}
        tags={true}
        mouse={true}
        invertSelected={false}
        items={subList.map(this.props.renderItem)}
      >

      </blessed-list>

    );
  }
}
